import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { db, schema } from '@/db'
import { normalize } from './categories'
import { zonedParts } from './time'

const { accounts, assets, assetSnapshots, debts, netWorthSnapshots } = schema

type AssetKind = typeof schema.assetKind.enumValues[number]

/**
 * Tai san, no, va gia tri tai san rong.
 *
 * Day la buc tranh ma so chi tieu khong cho thay. Ghi chep hang ngay tra
 * loi "thang nay toi tieu gi"; phan nay tra loi "toi dang di len hay di
 * xuong". Hai cau hoi khac nhau, va cau thu hai moi la cau quan trong.
 *
 * Bot KHONG tu lay gia thi truong. Vang, co phieu, bat dong san deu do
 * ban tu cap nhat gia tri. Co ve bat tien, nhung doi lai: khong phu
 * thuoc nguon du lieu ngoai nao co the chet hoac tra ve gia sai, va ban
 * biet chinh xac con so trong bao cao tu dau ra.
 */

/* ------------------------------------------------------------------ *
 * Doan loai tai san tu ten
 * ------------------------------------------------------------------ */

const KIND_HINTS: Array<{ kind: AssetKind; words: string[]; icon: string }> = [
  { kind: 'gold', icon: '🥇', words: ['vang', 'sjc', 'pnj', 'doji', 'nhan tron', 'vang mieng'] },
  { kind: 'savings', icon: '🏦', words: ['tiet kiem', 'so tiet kiem', 'gui ngan hang', 'ky han'] },
  { kind: 'stock', icon: '📈', words: ['co phieu', 'chung khoan', 'ck', 'stock'] },
  { kind: 'fund', icon: '📊', words: ['quy', 'chung chi quy', 'etf', 'fund', 'dcds', 'vfm'] },
  { kind: 'crypto', icon: '₿', words: ['crypto', 'bitcoin', 'btc', 'eth', 'usdt', 'tien so'] },
  { kind: 'realestate', icon: '🏘️', words: ['dat', 'nha', 'bat dong san', 'bds', 'can ho', 'chung cu'] },
]

export function guessAssetKind(name: string): { kind: AssetKind; icon: string } {
  const n = ` ${normalize(name)} `
  let best: { kind: AssetKind; icon: string; len: number } | null = null

  for (const hint of KIND_HINTS) {
    for (const w of hint.words) {
      if (!n.includes(` ${w} `)) continue
      if (!best || w.length > best.len) best = { kind: hint.kind, icon: hint.icon, len: w.length }
    }
  }
  return best ? { kind: best.kind, icon: best.icon } : { kind: 'other', icon: '📦' }
}

export function iconFor(kind: AssetKind): string {
  return KIND_HINTS.find((h) => h.kind === kind)?.icon ?? '📦'
}

export const KIND_LABEL: Record<AssetKind, string> = {
  cash: 'Tiền mặt',
  savings: 'Tiết kiệm',
  stock: 'Cổ phiếu',
  fund: 'Quỹ',
  gold: 'Vàng',
  crypto: 'Tiền số',
  realestate: 'Bất động sản',
  other: 'Khác',
}

/* ------------------------------------------------------------------ *
 * Tai san
 * ------------------------------------------------------------------ */

export interface AssetRow {
  id: number
  name: string
  kind: AssetKind
  value: Decimal
  costBasis: Decimal | null
  /** Lai/lo so voi gia von, null neu chua khai gia von */
  gain: Decimal | null
  gainPercent: Decimal | null
}

export async function listAssets(userId: number): Promise<AssetRow[]> {
  const rows = await db.query.assets.findMany({
    where: and(eq(assets.userId, userId), eq(assets.isArchived, false)),
  })
  if (!rows.length) return []

  /**
   * Gia tri moi nhat cua tung tai san, CHI cua nguoi dung nay.
   *
   * DISTINCT ON de database tra ve dung mot dong cho moi tai san thay vi
   * toan bo lich su. Thieu menh de WHERE o day tung lam truy van quet ca
   * bang cua moi nguoi dung va cham den muc Supabase huy lenh - va ve
   * nguyen tac, du lieu cua nguoi khac cung khong duoc phep di qua day.
   */
  const ids = rows.map((r) => r.id)
  const latest = await db
    .select({
      assetId: assetSnapshots.assetId,
      value: assetSnapshots.value,
    })
    .from(assetSnapshots)
    .where(inArray(assetSnapshots.assetId, ids))
    .orderBy(assetSnapshots.assetId, desc(assetSnapshots.takenOn))

  const valueOf = new Map<number, Decimal>()
  for (const s of latest) {
    if (!valueOf.has(s.assetId)) valueOf.set(s.assetId, new Decimal(s.value))
  }

  return rows
    .map((a) => {
      const value = valueOf.get(a.id) ?? new Decimal(0)
      const costBasis = a.costBasis ? new Decimal(a.costBasis) : null
      const gain = costBasis && costBasis.gt(0) ? value.minus(costBasis) : null
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        value,
        costBasis,
        gain,
        gainPercent: gain && costBasis?.gt(0) ? gain.div(costBasis).mul(100) : null,
      }
    })
    .sort((a, b) => b.value.comparedTo(a.value))
}

/**
 * Them tai san moi hoac cap nhat gia tri tai san da co.
 *
 * Moi lan cap nhat deu ghi them mot anh chup thay vi de len ban cu, de
 * sau nay ve duoc duong tang truong cua tung tai san.
 */
export async function upsertAsset(
  userId: number,
  name: string,
  value: Decimal,
  now: Date,
  tz: string,
  costBasis?: Decimal,
) {
  const existing = await findAssetLoose(userId, name)
  const takenOn = dateKey(now, tz)

  if (existing) {
    if (costBasis) {
      await db.update(assets)
        .set({ costBasis: costBasis.toFixed(2) })
        .where(eq(assets.id, existing.id))
    }
    await db.insert(assetSnapshots)
      .values({ assetId: existing.id, takenOn, value: value.toFixed(2) })
      .onConflictDoUpdate({
        target: [assetSnapshots.assetId, assetSnapshots.takenOn],
        set: { value: value.toFixed(2) },
      })
    return { asset: existing, created: false }
  }

  const { kind } = guessAssetKind(name)
  const [created] = await db.insert(assets).values({
    userId,
    name: name.trim(),
    kind,
    costBasis: costBasis?.toFixed(2),
  }).returning()

  await db.insert(assetSnapshots).values({
    assetId: created.id,
    takenOn,
    value: value.toFixed(2),
  })

  return { asset: created, created: true }
}

export async function findAssetLoose(userId: number, query: string) {
  const q = normalize(query)
  if (!q) return null

  const all = await db.query.assets.findMany({
    where: and(eq(assets.userId, userId), eq(assets.isArchived, false)),
  })

  const exact = all.find((a) => normalize(a.name) === q)
  if (exact) return exact

  return all
    .filter((a) => normalize(a.name).includes(q) || q.includes(normalize(a.name)))
    .sort((a, b) => a.name.length - b.name.length)[0] ?? null
}

export async function archiveAsset(userId: number, assetId: number) {
  await db.update(assets)
    .set({ isArchived: true })
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
}

/* ------------------------------------------------------------------ *
 * No
 * ------------------------------------------------------------------ */

export interface DebtRow {
  id: number
  name: string
  outstanding: Decimal
  annualRate: Decimal
  /** Tien lai phai tra moi thang neu giu nguyen du no */
  monthlyInterest: Decimal
}

export async function listDebts(userId: number): Promise<DebtRow[]> {
  const rows = await db.query.debts.findMany({ where: eq(debts.userId, userId) })

  return rows
    .map((d) => {
      const outstanding = new Decimal(d.outstanding)
      const annualRate = new Decimal(d.annualRate)
      return {
        id: d.id,
        name: d.name,
        outstanding,
        annualRate,
        monthlyInterest: outstanding.mul(annualRate).div(100).div(12),
      }
    })
    // Lai suat cao xep truoc: day chinh la thu tu nen tra no
    .sort((a, b) => b.annualRate.comparedTo(a.annualRate))
}

export async function upsertDebt(
  userId: number,
  name: string,
  outstanding: Decimal,
  annualRate: Decimal,
) {
  const existing = await findDebtLoose(userId, name)

  if (existing) {
    await db.update(debts)
      .set({ outstanding: outstanding.toFixed(2), annualRate: annualRate.toFixed(3) })
      .where(eq(debts.id, existing.id))
    return { created: false }
  }

  await db.insert(debts).values({
    userId,
    name: name.trim(),
    principal: outstanding.toFixed(2),
    outstanding: outstanding.toFixed(2),
    annualRate: annualRate.toFixed(3),
  })
  return { created: true }
}

export async function findDebtLoose(userId: number, query: string) {
  const q = normalize(query)
  if (!q) return null

  const all = await db.query.debts.findMany({ where: eq(debts.userId, userId) })
  const exact = all.find((d) => normalize(d.name) === q)
  if (exact) return exact

  return all
    .filter((d) => normalize(d.name).includes(q) || q.includes(normalize(d.name)))
    .sort((a, b) => a.name.length - b.name.length)[0] ?? null
}

export async function removeDebt(userId: number, debtId: number) {
  await db.delete(debts).where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
}

/* ------------------------------------------------------------------ *
 * Gia tri tai san rong
 * ------------------------------------------------------------------ */

export interface NetWorth {
  liquid: Decimal
  invested: Decimal
  debt: Decimal
  total: Decimal
  assets: AssetRow[]
  debts: DebtRow[]
  /** Phan bo theo loai tai san, tinh tren liquid + invested */
  allocation: Array<{ kind: AssetKind; label: string; icon: string; value: Decimal; percent: Decimal }>
  /** Anh chup gan nhat truoc lan nay, de so sanh */
  previous: { takenOn: string; total: Decimal } | null
}

export async function buildNetWorth(userId: number): Promise<NetWorth> {
  const [accountRows, assetRows, debtRows, prev] = await Promise.all([
    db.select({ type: accounts.type, balance: accounts.balance })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false))),
    listAssets(userId),
    listDebts(userId),
    db.query.netWorthSnapshots.findFirst({
      where: eq(netWorthSnapshots.userId, userId),
      orderBy: desc(netWorthSnapshots.takenOn),
    }),
  ])

  const LIQUID = new Set(['cash', 'bank', 'savings', 'ewallet'])
  const liquid = accountRows
    .filter((a) => LIQUID.has(a.type))
    .reduce((s, a) => s.plus(new Decimal(a.balance)), new Decimal(0))

  const invested = assetRows.reduce((s, a) => s.plus(a.value), new Decimal(0))
  const debt = debtRows.reduce((s, d) => s.plus(d.outstanding), new Decimal(0))
  const total = liquid.plus(invested).minus(debt)

  // Phan bo tinh tren TAI SAN, khong tru no - de thay co cau dang nam o dau
  const gross = liquid.plus(invested)
  const byKind = new Map<AssetKind, Decimal>()
  if (liquid.gt(0)) byKind.set('cash', liquid)
  for (const a of assetRows) {
    byKind.set(a.kind, (byKind.get(a.kind) ?? new Decimal(0)).plus(a.value))
  }

  const allocation = [...byKind.entries()]
    .map(([kind, value]) => ({
      kind,
      label: KIND_LABEL[kind],
      icon: kind === 'cash' ? '💵' : iconFor(kind),
      value,
      percent: gross.gt(0) ? value.div(gross).mul(100) : new Decimal(0),
    }))
    .sort((a, b) => b.value.comparedTo(a.value))

  return {
    liquid,
    invested,
    debt,
    total,
    assets: assetRows,
    debts: debtRows,
    allocation,
    previous: prev ? { takenOn: prev.takenOn, total: new Decimal(prev.total) } : null,
  }
}

/**
 * Chup lai gia tri tai san rong hom nay.
 *
 * Goi tu bao cao dinh ky. Khong chup thi vinh vien khong ve duoc duong
 * tang truong, vi so du vi va gia tri tai san chi luu trang thai hien
 * tai chu khong luu lich su.
 */
export async function snapshotNetWorth(userId: number, now: Date, tz: string) {
  const nw = await buildNetWorth(userId)
  const takenOn = dateKey(now, tz)

  await db.insert(netWorthSnapshots)
    .values({
      userId,
      takenOn,
      liquid: nw.liquid.toFixed(2),
      invested: nw.invested.toFixed(2),
      debt: nw.debt.toFixed(2),
      total: nw.total.toFixed(2),
    })
    .onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.takenOn],
      set: {
        liquid: nw.liquid.toFixed(2),
        invested: nw.invested.toFixed(2),
        debt: nw.debt.toFixed(2),
        total: nw.total.toFixed(2),
      },
    })

  return nw
}

export async function netWorthHistory(userId: number, limit = 24) {
  return db
    .select({
      takenOn: netWorthSnapshots.takenOn,
      total: netWorthSnapshots.total,
      liquid: netWorthSnapshots.liquid,
      invested: netWorthSnapshots.invested,
      debt: netWorthSnapshots.debt,
    })
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(desc(netWorthSnapshots.takenOn))
    .limit(limit)
}

function dateKey(now: Date, tz: string): string {
  const p = zonedParts(now, tz)
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
