import { and, eq, gte, lt, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { db, schema } from '@/db'
import { normalize } from './categories'
import { startOfMonth, addMonths, daysInMonth, zonedParts } from './time'

const { budgets, categories, transactions } = schema

/**
 * Ngan sach theo danh muc va canh bao vuot nguong.
 *
 * Nguyen tac quan trong nhat o day la KHONG LAM PHIEN. Mot ung dung canh
 * bao lien tuc se bi tat thong bao sau ba ngay, va luc do no vo dung han.
 * Nen bot chi len tieng dung hai lan cho moi danh muc moi thang: khi cham
 * 80% (con kip xoay) va khi vuot 100%. Cot `alertedAt` ghi nho da bao
 * toi nguong nao roi.
 */

/** Hai moc duy nhat bot len tieng, theo % ngan sach da dung */
const THRESHOLDS = [100, 80] as const

export interface BudgetRow {
  categoryId: number
  categoryName: string
  icon: string | null
  amount: Decimal
  spent: Decimal
  /** % da dung, co the vuot 100 */
  used: Decimal
  remaining: Decimal
}

/** Moc dau thang duoi dang chuoi 'YYYY-MM-DD' de luu vao cot date */
function monthKey(now: Date, tz: string): string {
  const p = zonedParts(now, tz)
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-01`
}

/* ------------------------------------------------------------------ *
 * Doc / ghi ngan sach
 * ------------------------------------------------------------------ */

export async function listBudgets(
  userId: number,
  now: Date,
  tz: string,
): Promise<BudgetRow[]> {
  const month = monthKey(now, tz)
  const from = startOfMonth(now, tz)
  const to = addMonths(now, 1, tz)

  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      icon: categories.icon,
      amount: budgets.amount,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.userId, userId), eq(budgets.month, month)))

  if (!rows.length) return []

  const spentRows = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.type, 'expense'),
      gte(transactions.occurredAt, from),
      lt(transactions.occurredAt, to),
    ))
    .groupBy(transactions.categoryId)

  const spentMap = new Map(
    spentRows.map((r) => [r.categoryId, new Decimal(r.total ?? 0)]),
  )

  return rows
    .map((r) => {
      const amount = new Decimal(r.amount)
      const spent = spentMap.get(r.categoryId) ?? new Decimal(0)
      return {
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        icon: r.icon,
        amount,
        spent,
        used: amount.gt(0) ? spent.div(amount).mul(100) : new Decimal(0),
        remaining: amount.minus(spent),
      }
    })
    .sort((a, b) => b.used.comparedTo(a.used))
}

export async function setBudget(
  userId: number,
  categoryId: number,
  amount: Decimal,
  now: Date,
  tz: string,
) {
  const month = monthKey(now, tz)
  await db.insert(budgets)
    .values({ userId, categoryId, month, amount: amount.toFixed(2), alertedAt: 0 })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId, budgets.month],
      // Doi han muc thi xoa luon lich su canh bao, vi nguong da khac
      set: { amount: amount.toFixed(2), alertedAt: 0 },
    })
}

export async function removeBudget(
  userId: number,
  categoryId: number,
  now: Date,
  tz: string,
) {
  await db.delete(budgets).where(and(
    eq(budgets.userId, userId),
    eq(budgets.categoryId, categoryId),
    eq(budgets.month, monthKey(now, tz)),
  ))
}

/** Tim danh muc theo ten nguoi dung go, khong can go dau hay dung hoa thuong */
export async function findCategoryLoose(userId: number, query: string) {
  const q = normalize(query)
  if (!q) return null

  const all = await db.query.categories.findMany({
    where: and(eq(categories.userId, userId), eq(categories.isArchived, false)),
  })

  // Khop het truoc, roi moi den khop mot phan; trong khop mot phan thi
  // uu tien ten NGAN nhat, vi ten ngan chua it thong tin thua hon
  const exact = all.find((c) => normalize(c.name) === q)
  if (exact) return exact

  const partial = all
    .filter((c) => normalize(c.name).includes(q))
    .sort((a, b) => a.name.length - b.name.length)

  return partial[0] ?? null
}

/* ------------------------------------------------------------------ *
 * Canh bao
 * ------------------------------------------------------------------ */

export interface BudgetAlert {
  categoryName: string
  icon: string | null
  threshold: number
  amount: Decimal
  spent: Decimal
  remaining: Decimal
  daysLeft: number
  /** So tien con lai chia deu cho so ngay con lai */
  perDayLeft: Decimal | null
}

/**
 * Goi sau MOI giao dich chi. Tra ve canh bao neu vua vuot mot nguong
 * chua tung bao, hoac null neu khong co gi dang noi.
 *
 * Viec ghi lai nguong da bao nam trong cung ham nay de tranh tinh huong
 * hai tin nhan den cung luc cung sinh ra mot canh bao.
 */
export async function checkBudgetAlert(
  userId: number,
  categoryId: number,
  now: Date,
  tz: string,
): Promise<BudgetAlert | null> {
  const month = monthKey(now, tz)

  const budget = await db.query.budgets.findFirst({
    where: and(
      eq(budgets.userId, userId),
      eq(budgets.categoryId, categoryId),
      eq(budgets.month, month),
    ),
  })
  if (!budget) return null

  const amount = new Decimal(budget.amount)
  if (amount.lte(0)) return null

  const [row] = await db
    .select({ total: sql<string>`sum(${transactions.amount})` })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.categoryId, categoryId),
      eq(transactions.type, 'expense'),
      gte(transactions.occurredAt, startOfMonth(now, tz)),
      lt(transactions.occurredAt, addMonths(now, 1, tz)),
    ))

  const spent = new Decimal(row?.total ?? 0)
  const used = spent.div(amount).mul(100)

  // Nguong cao nhat da cham, va phai cao hon nguong da bao truoc do
  const hit = THRESHOLDS.find((t) => used.gte(t) && budget.alertedAt < t)
  if (!hit) return null

  await db.update(budgets)
    .set({ alertedAt: hit })
    .where(eq(budgets.id, budget.id))

  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
  })

  const p = zonedParts(now, tz)
  const daysLeft = daysInMonth(now, tz) - p.day
  const remaining = amount.minus(spent)

  return {
    categoryName: cat?.name ?? 'Danh mục',
    icon: cat?.icon ?? null,
    threshold: hit,
    amount,
    spent,
    remaining,
    daysLeft,
    perDayLeft: daysLeft > 0 && remaining.gt(0) ? remaining.div(daysLeft) : null,
  }
}
