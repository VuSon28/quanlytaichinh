import { and, eq, gte, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { db, schema } from '@/db'
import { buildSnapshot } from './metrics'
import { evaluate, type Insight } from './rules'
import { buildNetWorth, netWorthHistory, type NetWorth } from './assets'
import { listBudgets, type BudgetRow } from './budget'
import { addMonths, startOfMonth, monthLabel } from './time'

const { transactions, categories, users } = schema

export interface MonthlyFlow {
  /** 'YYYY-MM' */
  month: string
  label: string
  income: Decimal
  expense: Decimal
  net: Decimal
}

export interface DashboardData {
  displayName: string | null
  periodLabel: string

  netWorth: NetWorth
  netWorthHistory: Array<{ takenOn: string; total: Decimal }>

  flows: MonthlyFlow[]
  byCategory: Array<{ name: string; icon: string | null; kind: string; total: Decimal; percent: Decimal }>
  budgets: BudgetRow[]

  savingsRate: Decimal | null
  emergencyMonths: Decimal | null
  monthExpense: Decimal
  monthIncome: Decimal

  insights: Insight[]
}

export async function loadDashboard(userId: number, now = new Date()): Promise<DashboardData> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new Error('Không tìm thấy người dùng')
  const tz = user.timezone

  const [snapshot, netWorth, history, flows, budgets] = await Promise.all([
    buildSnapshot(userId, now, tz),
    buildNetWorth(userId),
    netWorthHistory(userId, 24),
    monthlyFlows(userId, now, tz, 12),
    listBudgets(userId, now, tz),
  ])

  const byCategory = snapshot.byCategory.map((c) => ({
    name: c.name,
    icon: c.icon,
    kind: c.kind,
    total: c.total,
    percent: snapshot.expense.gt(0)
      ? c.total.div(snapshot.expense).mul(100)
      : new Decimal(0),
  }))

  return {
    displayName: user.displayName,
    periodLabel: monthLabel(now, tz),
    netWorth,
    netWorthHistory: history
      .map((h) => ({ takenOn: h.takenOn, total: new Decimal(h.total) }))
      .reverse(), // cu -> moi, de ve tu trai sang phai
    flows,
    byCategory,
    budgets,
    savingsRate: snapshot.savingsRate,
    emergencyMonths: snapshot.emergencyMonths,
    monthExpense: snapshot.essential.plus(snapshot.flexible),
    monthIncome: snapshot.income,
    insights: evaluate(snapshot),
  }
}

/**
 * Thu chi theo thang.
 *
 * Gom nhom o tang database bang date_trunc theo MUI GIO CUA NGUOI DUNG,
 * khong phai gio may chu. Neu de Postgres dung UTC thi giao dich ghi luc
 * 1h sang ngay 1 se roi vao thang truoc - dung loi ma phan moc thoi gian
 * da sua o tang ung dung, nhung o day phai sua lai mot lan nua vi phep
 * gom nhom xay ra trong database.
 */
async function monthlyFlows(
  userId: number,
  now: Date,
  tz: string,
  months: number,
): Promise<MonthlyFlow[]> {
  const from = addMonths(now, -(months - 1), tz)

  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${tz}, 'YYYY-MM')`,
      type: transactions.type,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      gte(transactions.occurredAt, from),
    ))
    /**
     * Gom nhom theo VI TRI cot trong danh sach chon (1 = thang, 2 = loai),
     * khong viet lai bieu thuc.
     *
     * Viet lai se sinh ra mot tham so thu hai cho cung mot mui gio, va
     * Postgres coi hai bieu thuc chua tham so khac nhau la khac nhau -
     * bao loi "must appear in the GROUP BY clause" du nhin bang mat thi
     * hai ben giong het.
     */
    .groupBy(sql`1`, sql`2`)

  const map = new Map<string, { income: Decimal; expense: Decimal }>()
  for (const r of rows) {
    const slot = map.get(r.month) ?? { income: new Decimal(0), expense: new Decimal(0) }
    const total = new Decimal(r.total ?? 0)
    if (r.type === 'income') slot.income = slot.income.plus(total)
    else if (r.type === 'expense') slot.expense = slot.expense.plus(total)
    map.set(r.month, slot)
  }

  // Dung day du cac thang ke ca thang khong co giao dich, de truc thoi
  // gian deu dan thay vi nhay coc
  const out: MonthlyFlow[] = []
  for (let i = months - 1; i >= 0; i--) {
    const at = addMonths(now, -i, tz)
    const key = monthKeyOf(at, tz)
    const slot = map.get(key) ?? { income: new Decimal(0), expense: new Decimal(0) }
    out.push({
      month: key,
      label: key.slice(5), // 'MM'
      income: slot.income,
      expense: slot.expense,
      net: slot.income.minus(slot.expense),
    })
  }
  return out
}

function monthKeyOf(at: Date, tz: string): string {
  const start = startOfMonth(at, tz)
  // Lay lai Y-M tu chinh moc dau thang de khong lech mui gio
  const iso = new Date(start.getTime() + 12 * 3600 * 1000).toISOString()
  return iso.slice(0, 7)
}
