import Decimal from 'decimal.js'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { formatVnd, formatShort } from './money'
import { buildSnapshot } from './metrics'
import { evaluate } from './rules'
import { listBudgets } from './budget'
import { snapshotNetWorth } from './assets'
import { totalsBetween } from './ledger'
import {
  startOfDay, startOfMonth, addDays, addMonths, zonedParts,
  daysInMonth, monthLabel,
} from './time'

/**
 * Bao cao dinh ky bot tu gui, khong cho nguoi dung hoi.
 *
 * Day la khac biet giua mot cuon so va mot tro ly. Cuon so nam yen cho
 * ban mo ra; tro ly len tieng khi co gi dang chu y. Nhung "dang chu y"
 * phai that su dang - neu bot nhan tin moi ngay chi de noi "hom nay ban
 * tieu 120k" thi sau mot tuan ban se tat thong bao, va luc do no vo dung.
 *
 * Nen bo loc o day kha chat:
 *  - Bao cao tuan: chi gui khi trong tuan co phat sinh giao dich
 *  - Bao cao thang: gui vao ngay cuoi thang, kem nhan dinh
 *  - Ngay thuong: chi len tieng khi co ngan sach sap vuot
 */

export type DigestKind = 'daily' | 'weekly' | 'monthly'

export interface Digest {
  telegramId: number
  text: string
}

/**
 * Sinh bao cao cho tat ca nguoi dung den gio.
 *
 * `now` la thoi diem cron chay (UTC). Moi nguoi dung co mui gio va gio
 * nhan bao cao rieng, nen ham tu loc ai den gio - nho vay cron chi can
 * chay moi gio mot lan la phuc vu duoc moi mui gio.
 */
export async function buildDueDigests(now: Date): Promise<Digest[]> {
  const users = await db.query.users.findMany()
  const out: Digest[] = []

  for (const u of users) {
    const tz = u.timezone
    const p = zonedParts(now, tz)
    const today = localDateKey(now, tz)

    /**
     * Hai dieu kien, va co y khong kiem tra "dung gio X".
     *
     * Cron cua Vercel o goi mien phi co the nao trong khoang mot tieng,
     * va tai lieu cua ho noi ro: mot lan chay co the bi bo sot, hoac bi
     * goi hai lan. Neu doi dung gio thi mot lan tre la mat bao cao ca
     * ngay; neu khong chan trung thi mot lan goi lap la hai tin nhan.
     *
     * Nen: da qua gio hen, VA hom nay chua gui. Nhu vay lan goi thu hai
     * trong ngay khong lam gi, con mot ngay bi sot thi hom sau van gui.
     */
    if (p.hour < u.digestHour) continue
    if (u.lastDigestOn === today) continue

    const kind = pickKind(now, tz, u.weeklyDigestDow)
    const text = await renderDigest(u.id, kind, now, tz)

    /**
     * Danh dau da gui KE CA khi khong co gi de noi. Neu chi danh dau khi
     * co noi dung thi mot ngay im lang se khien moi lan cron chay lai
     * deu tinh toan lai tu dau - ton cong ma khong duoc gi.
     */
    await db.update(schema.users)
      .set({ lastDigestOn: today })
      .where(eq(schema.users.id, u.id))

    if (text) out.push({ telegramId: u.telegramId, text })
  }

  return out
}

/** Ngay theo lich dia phuong, dang 'YYYY-MM-DD' */
function localDateKey(now: Date, tz: string): string {
  const p = zonedParts(now, tz)
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Ngay cuoi thang uu tien hon bao cao tuan, de khong gui hai tin lien nhau */
function pickKind(now: Date, tz: string, weeklyDow: number): DigestKind {
  const p = zonedParts(now, tz)
  if (p.day === daysInMonth(now, tz)) return 'monthly'
  if (p.weekday === weeklyDow) return 'weekly'
  return 'daily'
}

/** Tra ve null neu khong co gi dang noi - im lang la mot lua chon hop le */
export async function renderDigest(
  userId: number,
  kind: DigestKind,
  now: Date,
  tz: string,
): Promise<string | null> {
  if (kind === 'daily') return renderDaily(userId, now, tz)
  if (kind === 'weekly') return renderWeekly(userId, now, tz)
  return renderMonthly(userId, now, tz)
}

/* ------------------------------------------------------------------ *
 * Hang ngay - chi len tieng khi ngan sach sap vuot
 * ------------------------------------------------------------------ */

async function renderDaily(userId: number, now: Date, tz: string): Promise<string | null> {
  const budgets = await listBudgets(userId, now, tz)
  const p = zonedParts(now, tz)
  const daysLeft = daysInMonth(now, tz) - p.day

  /**
   * Chi bao khi ngan sach dang dung NHANH HON nhip thang. Vuot 60% vao
   * ngay 25 la binh thuong; vuot 60% vao ngay 10 moi la van de.
   */
  const timeGone = new Decimal(p.day).div(daysInMonth(now, tz)).mul(100)
  const risky = budgets.filter((b) => b.used.minus(timeGone).gte(15) && b.used.lt(100))

  if (!risky.length) return null

  const lines = ['*Nhắc nhẹ cuối ngày*', '']
  for (const b of risky) {
    lines.push(
      `${b.icon ?? '•'} *${b.categoryName}* — đã dùng ${b.used.toFixed(0)}% ngân sách ` +
      `trong khi tháng mới đi được ${timeGone.toFixed(0)}%`,
    )
    if (daysLeft > 0 && b.remaining.gt(0)) {
      lines.push(`   Còn ${formatShort(b.remaining)} cho ${daysLeft} ngày — khoảng ${formatVnd(b.remaining.div(daysLeft))}/ngày`)
    }
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
 * Hang tuan
 * ------------------------------------------------------------------ */

async function renderWeekly(userId: number, now: Date, tz: string): Promise<string | null> {
  const end = addDays(startOfDay(now, tz), 1, tz)
  const start = addDays(end, -7, tz)
  const prevStart = addDays(start, -7, tz)

  const cur = await totalsBetween(userId, start, end)
  if (cur.expense.isZero() && cur.income.isZero()) return null // tuan khong co gi

  const prev = await totalsBetween(userId, prevStart, start)

  const lines = ['*Tổng kết 7 ngày qua*', '']
  lines.push(`Chi: *${formatVnd(cur.expense)}*`)

  if (!prev.expense.isZero()) {
    const diff = cur.expense.minus(prev.expense)
    const pct = diff.div(prev.expense).mul(100)
    const arrow = diff.gt(0) ? '▲' : '▼'
    lines.push(`${arrow} ${pct.abs().toFixed(0)}% so với tuần trước (${formatShort(prev.expense)})`)
  }
  if (!cur.income.isZero()) lines.push(`Thu: ${formatVnd(cur.income)}`)

  if (cur.byCategory.length) {
    lines.push('', '*Tiêu nhiều nhất*')
    for (const c of cur.byCategory.slice(0, 5)) {
      lines.push(`${c.icon ?? '•'} ${c.name} — ${formatShort(c.total)}`)
    }
  }

  const budgets = await listBudgets(userId, now, tz)
  const over = budgets.filter((b) => b.used.gte(80))
  if (over.length) {
    lines.push('', '*Ngân sách cần để ý*')
    for (const b of over) {
      const state = b.remaining.lt(0)
        ? `vượt ${formatShort(b.remaining.abs())}`
        : `còn ${formatShort(b.remaining)}`
      lines.push(`${b.icon ?? '•'} ${b.categoryName} — ${b.used.toFixed(0)}%, ${state}`)
    }
  }

  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
 * Cuoi thang - bao cao day du kem nhan dinh
 * ------------------------------------------------------------------ */

async function renderMonthly(userId: number, now: Date, tz: string): Promise<string | null> {
  /**
   * Chup gia tri tai san rong truoc khi viet bao cao. Cuoi thang la moc
   * tu nhien de danh dau, va khong chup thi vinh vien khong ve duoc
   * duong tang truong - so du vi chi luu trang thai hien tai.
   */
  const nw = await snapshotNetWorth(userId, now, tz)

  const start = startOfMonth(now, tz)
  const end = addMonths(now, 1, tz)
  const cur = await totalsBetween(userId, start, end)
  if (cur.expense.isZero() && cur.income.isZero()) return null

  const snapshot = await buildSnapshot(userId, now, tz)
  const insights = evaluate(snapshot)

  const lines = [`*Khép sổ ${monthLabel(now, tz)}*`, '']
  lines.push(`Chi: *${formatVnd(cur.expense)}*`)
  if (!cur.income.isZero()) lines.push(`Thu: *${formatVnd(cur.income)}*`)
  if (snapshot.savingsRate) {
    lines.push(`Tỷ lệ tiết kiệm: *${snapshot.savingsRate.toFixed(0)}%*`)
  }

  if (cur.byCategory.length) {
    lines.push('', '*Top 5 danh mục*')
    for (const c of cur.byCategory.slice(0, 5)) {
      const pct = cur.expense.isZero()
        ? new Decimal(0)
        : c.total.div(cur.expense).mul(100)
      lines.push(`${c.icon ?? '•'} ${c.name} — ${formatShort(c.total)} (${pct.toFixed(0)}%)`)
    }
  }

  // Chi dua hai nhan dinh nang nhat - bao cao dai qua thi khong ai doc
  const top = insights.filter((i) => i.severity >= 2).slice(0, 2)
  if (top.length) {
    lines.push('', '*Điều đáng chú ý*')
    for (const i of top) {
      lines.push('', `${i.severity === 3 ? '🔴' : '🟡'} *${i.title}*`)
      if (i.action) lines.push(`→ ${i.action}`)
    }
  }

  if (!nw.total.isZero()) {
    lines.push('', `*Tài sản ròng: ${formatVnd(nw.total)}*`)
    if (nw.previous) {
      const diff = nw.total.minus(nw.previous.total)
      if (!diff.isZero()) {
        const arrow = diff.gt(0) ? '▲' : '▼'
        lines.push(`${arrow} ${formatShort(diff.abs())} so với lần chụp trước`)
      }
    }
  }

  lines.push('', '_Nhắn /danhgia để xem đánh giá đầy đủ._')
  return lines.join('\n')
}

/** Dung cho cron: lay telegram id de gui, khong can nap ca ban ghi */
export async function getTelegramId(userId: number): Promise<number | null> {
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
  return u?.telegramId ?? null
}
