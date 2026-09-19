/**
 * Kiem thu lich gui bao cao dinh ky tren database THAT.
 * Chay: npm run test:cron
 *
 * Trong tam: bao cao phai chiu duoc ca hai kieu hong cua cron.
 *
 *  - Goi LAP (Vercel co the goi cung mot lan chay hai lan): khong duoc
 *    gui hai tin nhan.
 *  - BO SOT mot ngay: hom sau van phai gui, khong duoc bo luon.
 *
 * Va vi goi mien phi cua Vercel co the nao bat ky luc nao trong mot
 * tieng, khong duoc doi "dung gio X" moi gui.
 */
import Decimal from 'decimal.js'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db'
import { parseTransaction } from '../src/lib/parser'
import {
  getOrCreateUser, findCategoryByName, getDefaultAccount, recordTransaction,
} from '../src/lib/ledger'
import { buildDueDigests } from '../src/lib/digest'
import { zonedParts } from '../src/lib/time'

const FAKE_ID = -999007
const TZ = 'Asia/Ho_Chi_Minh'

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`) }
}

/** Mot thoi diem UTC ung voi gio da cho o Viet Nam, cung ngay */
function atVnHour(dayOffset: number, vnHour: number): Date {
  const base = new Date()
  base.setUTCDate(base.getUTCDate() + dayOffset)
  // Viet Nam = UTC+7
  base.setUTCHours(vnHour - 7, 0, 0, 0)
  return base
}

async function reset(userId: number) {
  await db.update(schema.users)
    .set({ lastDigestOn: null })
    .where(eq(schema.users.id, userId))
}

async function main() {
  const user = await getOrCreateUser(FAKE_ID, 'Thử cron')
  const account = await getDefaultAccount(user.id)

  /**
   * Dat ngay nhan bao cao tuan THANH HOM NAY.
   *
   * Bao cao hang ngay co y im lang khi khong co gi bat thuong - dung nhu
   * thiet ke. Nhung o day dang kiem thu LICH GUI, khong phai noi dung,
   * nen can mot loai bao cao luon co noi dung khi so co giao dich. Bao
   * cao tuan dap ung dieu do, va lam vay thi test chay ngay nao cung cho
   * ket qua giong nhau.
   */
  const todayDow = zonedParts(new Date(), TZ).weekday
  await db.update(schema.users)
    .set({ weeklyDigestDow: todayDow })
    .where(eq(schema.users.id, user.id))

  // Co giao dich thi bao cao moi co noi dung
  for (const [cat, text] of [
    ['Ăn ngoài & cà phê', 'cafe 45k'],
    ['Nhà ở', 'tien nha 5tr'],
  ] as const) {
    const c = await findCategoryByName(user.id, cat)
    const p = parseTransaction(text)
    await recordTransaction({
      userId: user.id, parsed: p!, categoryId: c!.id,
      accountId: account!.id, rawInput: text,
    })
  }

  console.log('\n── Chưa tới giờ hẹn thì im lặng ──')
  {
    await reset(user.id)
    // Gio nhan bao cao mac dinh la 20h
    const d = await buildDueDigests(atVnHour(0, 9))
    const mine = d.filter((x) => x.telegramId === FAKE_ID)
    check('9h sáng → chưa gửi', mine.length === 0, `nhận được ${mine.length} tin`)
  }

  console.log('\n── Tới giờ thì gửi ──')
  {
    await reset(user.id)
    const d = await buildDueDigests(atVnHour(0, 20))
    const mine = d.filter((x) => x.telegramId === FAKE_ID)
    check('20h → gửi 1 tin', mine.length === 1, `nhận được ${mine.length} tin`)
    check('  tin có nội dung', (mine[0]?.text.length ?? 0) > 20)
  }

  console.log('\n── Cron nổ trễ trong cùng giờ vẫn gửi ──')
  {
    await reset(user.id)
    // Goi mien phi cua Vercel co the nao bat ky luc nao trong tieng do
    const d = await buildDueDigests(atVnHour(0, 20))
    check('20h00 → gửi', d.filter((x) => x.telegramId === FAKE_ID).length === 1)

    await reset(user.id)
    const d2 = await buildDueDigests(atVnHour(0, 23))
    check('23h (trễ 3 tiếng) → vẫn gửi', d2.filter((x) => x.telegramId === FAKE_ID).length === 1)
  }

  console.log('\n── Gọi LẶP trong cùng ngày → chỉ gửi một lần ──')
  {
    await reset(user.id)
    const first = await buildDueDigests(atVnHour(0, 20))
    const second = await buildDueDigests(atVnHour(0, 20))
    const third = await buildDueDigests(atVnHour(0, 21))

    check('lần gọi 1 → gửi', first.filter((x) => x.telegramId === FAKE_ID).length === 1)
    check('lần gọi 2 → IM LẶNG', second.filter((x) => x.telegramId === FAKE_ID).length === 0,
      'gọi lặp không được sinh tin nhắn thứ hai')
    check('lần gọi 3 (giờ khác) → vẫn IM LẶNG',
      third.filter((x) => x.telegramId === FAKE_ID).length === 0)
  }

  console.log('\n── Ngày hôm sau thì gửi lại ──')
  {
    // Gia lap: hom qua da gui
    const yesterday = atVnHour(-1, 20)
    const p = new Date(yesterday.getTime() + 7 * 3600 * 1000)
    await db.update(schema.users)
      .set({ lastDigestOn: p.toISOString().slice(0, 10) })
      .where(eq(schema.users.id, user.id))

    const d = await buildDueDigests(atVnHour(0, 20))
    check('hôm nay là ngày mới → gửi lại',
      d.filter((x) => x.telegramId === FAKE_ID).length === 1)
  }

  console.log('\n── Bỏ sót một ngày → hôm sau vẫn gửi, không bỏ luôn ──')
  {
    const threeDaysAgo = atVnHour(-3, 20)
    const p = new Date(threeDaysAgo.getTime() + 7 * 3600 * 1000)
    await db.update(schema.users)
      .set({ lastDigestOn: p.toISOString().slice(0, 10) })
      .where(eq(schema.users.id, user.id))

    const d = await buildDueDigests(atVnHour(0, 20))
    check('3 ngày không chạy → hôm nay vẫn gửi',
      d.filter((x) => x.telegramId === FAKE_ID).length === 1)
  }

  console.log('\n── Người chưa ghi gì thì không làm phiền ──')
  {
    const empty = await getOrCreateUser(-999008, 'Người mới')
    const d = await buildDueDigests(atVnHour(0, 20))
    check('sổ trống → không gửi tin nào',
      d.filter((x) => x.telegramId === -999008).length === 0)
    await db.delete(schema.users).where(eq(schema.users.id, empty.id))
  }

  console.log('\n── Dọn dẹp ──')
  await db.delete(schema.users).where(eq(schema.users.id, user.id))
  check('đã xoá sạch', !(await db.query.users.findFirst({
    where: eq(schema.users.telegramId, FAKE_ID),
  })))

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Đạt: ${pass}   Hỏng: ${fail}`)
  console.log(`${'─'.repeat(50)}\n`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('\n❌ HỎNG:', e.message)
  try {
    await db.delete(schema.users).where(eq(schema.users.telegramId, FAKE_ID))
    await db.delete(schema.users).where(eq(schema.users.telegramId, -999008))
  } catch { /* bo qua */ }
  process.exit(1)
})
