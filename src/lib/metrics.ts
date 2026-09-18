import { and, eq, gte, lt, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { db, schema } from '@/db'

const { accounts, categories, transactions, users, goals, debts } = schema

/**
 * Tang tinh toan. KHONG co AI o day.
 *
 * Moi con so trong bao cao tai chinh deu sinh ra tu ham trong file nay,
 * tinh truc tiep tu database. AI (neu bat) chi duoc doc ket qua da tinh
 * roi dien dat lai cho de hieu - no khong duoc phep cong tru bat cu thu
 * gi. Day la khac biet quan trong nhat giua bot nay va cac bot tai chinh
 * khac: mo hinh ngon ngu rat gioi viet lach nhung rat de tinh sai, va
 * mot con so sai trong bao cao tai chinh thi tai hai hon la khong co.
 */

export interface Snapshot {
  periodLabel: string
  daysElapsed: number
  daysInPeriod: number

  income: Decimal
  /** Thu nhap dung lam mau so: uu tien so khai bao, khong co thi lay thuc thu */
  incomeBasis: Decimal
  incomeIsDeclared: boolean

  expense: Decimal
  essential: Decimal
  flexible: Decimal
  saving: Decimal

  /** (thu - chi) / thu, tinh theo phan tram */
  savingsRate: Decimal | null

  /** Tien mat + ngan hang + tiet kiem + vi dien tu */
  liquidAssets: Decimal
  /** Tong du no */
  totalDebt: Decimal
  /** Lai suat cao nhat trong cac khoan no */
  worstDebtRate: Decimal | null

  /** liquidAssets / chi thiet yeu trung binh thang */
  emergencyMonths: Decimal | null
  monthlyEssentialAvg: Decimal | null

  byCategory: CategoryTotal[]
  /** So voi cung ky thang truoc */
  previous: { expense: Decimal; byCategory: CategoryTotal[] } | null

  hasEmergencyGoal: boolean
}

export interface CategoryTotal {
  name: string
  icon: string | null
  kind: 'essential' | 'flexible' | 'saving'
  total: Decimal
}

const ZERO = new Decimal(0)

export async function buildSnapshot(userId: number, now = new Date()): Promise<Snapshot> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [user, current, previousRaw, balances, debtRows, efGoal] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    periodTotals(userId, monthStart, monthEnd),
    periodTotals(userId, prevStart, monthStart),
    liquidTotal(userId),
    db.query.debts.findMany({ where: eq(debts.userId, userId) }),
    db.query.goals.findFirst({
      where: and(eq(goals.userId, userId), eq(goals.isEmergencyFund, true)),
    }),
  ])

  const declared = user?.monthlyIncome ? new Decimal(user.monthlyIncome) : null
  const incomeBasis = declared && declared.gt(0) ? declared : current.income
  const incomeIsDeclared = Boolean(declared && declared.gt(0))

  /**
   * Ty le tiet kiem tinh tren chi tieu THUC (essential + flexible), khong
   * tru phan 'saving'. Tien chuyen vao tiet kiem hay dau tu van la tien
   * cua ban - coi no la chi tieu se lam ty le tiet kiem thap gia tao.
   */
  const realSpend = current.essential.plus(current.flexible)
  const savingsRate = incomeBasis.gt(0)
    ? incomeBasis.minus(realSpend).div(incomeBasis).mul(100)
    : null

  const monthlyEssentialAvg = await averageMonthlyEssential(userId, now)
  const emergencyMonths = monthlyEssentialAvg && monthlyEssentialAvg.gt(0)
    ? balances.div(monthlyEssentialAvg)
    : null

  const totalDebt = debtRows.reduce((s, d) => s.plus(new Decimal(d.outstanding)), ZERO)
  const worstDebtRate = debtRows.length
    ? debtRows.reduce(
        (max, d) => Decimal.max(max, new Decimal(d.annualRate)),
        ZERO,
      )
    : null

  const daysInPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  return {
    periodLabel: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
    daysElapsed: now.getDate(),
    daysInPeriod,
    income: current.income,
    incomeBasis,
    incomeIsDeclared,
    expense: current.expense,
    essential: current.essential,
    flexible: current.flexible,
    saving: current.saving,
    savingsRate,
    liquidAssets: balances,
    totalDebt,
    worstDebtRate,
    emergencyMonths,
    monthlyEssentialAvg,
    byCategory: current.byCategory,
    previous: previousRaw.expense.isZero() && !previousRaw.byCategory.length
      ? null
      : { expense: previousRaw.expense, byCategory: previousRaw.byCategory },
    hasEmergencyGoal: Boolean(efGoal),
  }
}

/* ------------------------------------------------------------------ *
 * Truy van thanh phan
 * ------------------------------------------------------------------ */

interface Totals {
  income: Decimal
  expense: Decimal
  essential: Decimal
  flexible: Decimal
  saving: Decimal
  byCategory: CategoryTotal[]
}

async function periodTotals(userId: number, from: Date, to: Date): Promise<Totals> {
  const rows = await db
    .select({
      type: transactions.type,
      name: categories.name,
      icon: categories.icon,
      kind: categories.kind,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.userId, userId),
      gte(transactions.occurredAt, from),
      lt(transactions.occurredAt, to),
    ))
    .groupBy(transactions.type, categories.name, categories.icon, categories.kind)

  const out: Totals = {
    income: ZERO, expense: ZERO, essential: ZERO, flexible: ZERO, saving: ZERO,
    byCategory: [],
  }

  for (const r of rows) {
    const total = new Decimal(r.total ?? 0)
    if (r.type === 'income') { out.income = out.income.plus(total); continue }
    if (r.type !== 'expense') continue

    out.expense = out.expense.plus(total)
    const kind = (r.kind ?? 'flexible') as CategoryTotal['kind']
    if (kind === 'essential') out.essential = out.essential.plus(total)
    else if (kind === 'flexible') out.flexible = out.flexible.plus(total)
    else out.saving = out.saving.plus(total)

    out.byCategory.push({ name: r.name ?? 'Chưa phân loại', icon: r.icon, kind, total })
  }

  out.byCategory.sort((a, b) => b.total.comparedTo(a.total))
  return out
}

/** Tong tien co the rut ra dung ngay - khong tinh tai san dau tu dai han */
async function liquidTotal(userId: number): Promise<Decimal> {
  const rows = await db
    .select({ type: accounts.type, balance: accounts.balance })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)))

  const LIQUID = new Set(['cash', 'bank', 'savings', 'ewallet'])
  return rows
    .filter((r) => LIQUID.has(r.type))
    .reduce((s, r) => s.plus(new Decimal(r.balance)), ZERO)
}

/**
 * Chi thiet yeu trung binh thang, lay tu toi da 3 thang gan nhat.
 *
 * Dung trung binh thay vi thang hien tai vi thang nay co the moi di duoc
 * vai ngay - chia cho no se ra so thang quy khan cap cao gia tao.
 */
async function averageMonthlyEssential(userId: number, now: Date): Promise<Decimal | null> {
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const to = new Date(now.getFullYear(), now.getMonth(), 1)

  const [row] = await db
    .select({ total: sql<string>`sum(${transactions.amount})` })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.type, 'expense'),
      eq(categories.kind, 'essential'),
      gte(transactions.occurredAt, from),
      lt(transactions.occurredAt, to),
    ))

  const total = new Decimal(row?.total ?? 0)
  if (total.isZero()) {
    // Chua du lich su -> tam dung chinh thang nay, quy doi ve ca thang
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const cur = await periodTotals(userId, monthStart, monthEnd)
    if (cur.essential.isZero()) return null
    const daysElapsed = Math.max(now.getDate(), 1)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return cur.essential.div(daysElapsed).mul(daysInMonth)
  }
  return total.div(3)
}
