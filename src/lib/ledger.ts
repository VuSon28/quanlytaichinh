import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { db, schema } from '@/db'
import { SEED_CATEGORIES, normalize } from './categories'
import type { ParsedTx } from './parser'

const { users, accounts, categories, keywordMap, transactions } = schema

/* ------------------------------------------------------------------ *
 * Khoi tao nguoi dung
 * ------------------------------------------------------------------ */

/**
 * Lay user theo telegram id, tu tao kem danh muc mac dinh neu chua co.
 * Goi o dau moi request - re vi chi la mot truy van khi user da ton tai.
 */
export async function getOrCreateUser(telegramId: number, displayName?: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  })
  if (existing) return existing

  const [created] = await db.insert(users)
    .values({ telegramId, displayName })
    .returning()

  await seedCategories(created.id)
  await db.insert(accounts).values({
    userId: created.id,
    name: 'Tiền mặt',
    type: 'cash',
    isDefault: true,
  })

  return created
}

async function seedCategories(userId: number) {
  await db.insert(categories).values(
    SEED_CATEGORIES.map((c, i) => ({
      userId,
      name: c.name,
      icon: c.icon,
      kind: c.kind,
      isIncome: c.isIncome ?? false,
      sortOrder: i,
    })),
  )
}

/* ------------------------------------------------------------------ *
 * Bo nho tu khoa
 * ------------------------------------------------------------------ */

/** Nap tu khoa da hoc de dua vao parser. */
export async function loadLearnedKeywords(userId: number): Promise<Map<string, string>> {
  const rows = await db
    .select({ keyword: keywordMap.keyword, name: categories.name })
    .from(keywordMap)
    .innerJoin(categories, eq(keywordMap.categoryId, categories.id))
    .where(eq(keywordMap.userId, userId))

  return new Map(rows.map((r) => [r.keyword, r.name]))
}

/**
 * Ghi nho: tu nay thuoc danh muc nay.
 *
 * Goi sau MOI giao dich duoc xac nhan, ke ca khi luat da doan dung -
 * vi lan sau se khop o tang 'exact' thay vi 'seed', va hitCount cho biet
 * thoi quen that cua ban khi mot tu co the thuoc nhieu muc.
 */
export async function learnKeyword(userId: number, phrase: string, categoryId: number) {
  const keyword = normalize(phrase)
  if (!keyword || keyword.length < 2) return

  await db.insert(keywordMap)
    .values({ userId, keyword, categoryId, hitCount: 1 })
    .onConflictDoUpdate({
      target: [keywordMap.userId, keywordMap.keyword],
      set: {
        categoryId,
        hitCount: sql`${keywordMap.hitCount} + 1`,
        lastUsedAt: new Date(),
      },
    })
}

/* ------------------------------------------------------------------ *
 * Giao dich
 * ------------------------------------------------------------------ */

export async function findCategoryByName(userId: number, name: string) {
  return db.query.categories.findFirst({
    where: and(eq(categories.userId, userId), eq(categories.name, name)),
  })
}

export async function listCategories(userId: number, isIncome: boolean) {
  return db.query.categories.findMany({
    where: and(
      eq(categories.userId, userId),
      eq(categories.isIncome, isIncome),
      eq(categories.isArchived, false),
    ),
    orderBy: categories.sortOrder,
  })
}

export async function getDefaultAccount(userId: number) {
  return db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.isDefault, true)),
  })
}

export interface RecordInput {
  userId: number
  parsed: ParsedTx
  categoryId: number | null
  accountId: number | null
  source?: typeof schema.txSource.enumValues[number]
  rawInput: string
}

export async function recordTransaction(input: RecordInput) {
  const { userId, parsed, categoryId, accountId, rawInput } = input

  const [tx] = await db.insert(transactions).values({
    userId,
    type: parsed.type,
    amount: parsed.amount.toFixed(2),
    accountId: accountId ?? undefined,
    categoryId: categoryId ?? undefined,
    note: parsed.note || null,
    source: input.source ?? 'text',
    rawInput,
    isAutoCategorized: parsed.confidence !== 'exact',
  }).returning()

  // Cap nhat so du vi. Chi tieu tru di, thu nhap cong vao.
  if (accountId) {
    const delta = parsed.type === 'income'
      ? parsed.amount
      : parsed.amount.negated()
    await db.update(accounts)
      .set({ balance: sql`${accounts.balance} + ${delta.toFixed(2)}` })
      .where(eq(accounts.id, accountId))
  }

  return tx
}

export async function deleteTransaction(userId: number, txId: number) {
  const tx = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, txId), eq(transactions.userId, userId)),
  })
  if (!tx) return null

  // Hoan lai so du truoc khi xoa
  if (tx.accountId) {
    const delta = tx.type === 'income'
      ? new Decimal(tx.amount).negated()
      : new Decimal(tx.amount)
    await db.update(accounts)
      .set({ balance: sql`${accounts.balance} + ${delta.toFixed(2)}` })
      .where(eq(accounts.id, tx.accountId))
  }

  await db.delete(transactions).where(eq(transactions.id, txId))
  return tx
}

export async function setMonthlyIncome(userId: number, amount: Decimal) {
  await db.update(users)
    .set({ monthlyIncome: amount.toFixed(2) })
    .where(eq(users.id, userId))
}

/**
 * Luu lai nhan dinh da dua ra.
 *
 * Muc dich khong phai de tra cuu, ma de bot BIET no da noi gi. Mot co
 * van tai chinh lap lai "ban nen tiet kiem nhieu hon" moi tuan thi chi
 * gay buc boi. O giai doan sau, bang nay cho phep bot noi "van chua cai
 * thien so voi lan truoc" thay vi noi lai tu dau.
 */
export async function saveInsights(
  userId: number,
  snapshot: { savingsRate: Decimal | null; emergencyMonths: Decimal | null; expense: Decimal },
  items: Array<{ code: string; severity: number; title: string; body: string }>,
) {
  const metrics = JSON.stringify({
    savingsRate: snapshot.savingsRate?.toFixed(1) ?? null,
    emergencyMonths: snapshot.emergencyMonths?.toFixed(1) ?? null,
    expense: snapshot.expense.toFixed(0),
  })

  await db.insert(schema.insights).values(
    items.map((i) => ({
      userId,
      ruleCode: i.code,
      severity: i.severity,
      body: `${i.title}\n${i.body}`,
      metrics,
    })),
  )
}

/* ------------------------------------------------------------------ *
 * Truy van bao cao
 * ------------------------------------------------------------------ */

export async function listRecent(userId: number, limit = 10) {
  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      note: transactions.note,
      occurredAt: transactions.occurredAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.occurredAt))
    .limit(limit)
}

export interface PeriodTotals {
  expense: Decimal
  income: Decimal
  byCategory: Array<{ name: string; icon: string | null; kind: string; total: Decimal }>
}

export async function totalsBetween(
  userId: number,
  from: Date,
  to: Date,
): Promise<PeriodTotals> {
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

  let expense = new Decimal(0)
  let income = new Decimal(0)
  const byCategory: PeriodTotals['byCategory'] = []

  for (const r of rows) {
    const total = new Decimal(r.total ?? 0)
    if (r.type === 'income') {
      income = income.plus(total)
    } else if (r.type === 'expense') {
      expense = expense.plus(total)
      byCategory.push({
        name: r.name ?? 'Chưa phân loại',
        icon: r.icon,
        kind: r.kind ?? 'flexible',
        total,
      })
    }
  }

  byCategory.sort((a, b) => b.total.comparedTo(a.total))
  return { expense, income, byCategory }
}
