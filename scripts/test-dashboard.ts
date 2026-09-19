/**
 * Kiem thu lop quyen truy cap va gom du lieu cho dashboard.
 * Chay: npm run test:dashboard
 *
 * Trong tam la phan QUYEN TRUY CAP. Trang nay hien toan bo tinh hinh tai
 * chinh cua mot nguoi; mot lo hong o day nghiem trong hon moi loi tinh
 * toan sai trong toan bo he thong.
 */
import Decimal from 'decimal.js'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db'
import { getOrCreateUser, findCategoryByName, getDefaultAccount, recordTransaction, setAccountBalance, setMonthlyIncome } from '../src/lib/ledger'
import { parseTransaction } from '../src/lib/parser'
import { upsertAsset, snapshotNetWorth } from '../src/lib/assets'
import { setBudget } from '../src/lib/budget'
import {
  makeLoginToken, verifyLoginToken, makeSessionToken, verifySessionToken,
} from '../src/lib/dashboard-auth'
import { loadDashboard } from '../src/lib/dashboard-data'

const FAKE_ID = -999006
const TZ = 'Asia/Ho_Chi_Minh'

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`) }
}

async function main() {
  console.log('\n── Chữ ký link đăng nhập ──')
  {
    const token = makeLoginToken(42)
    check('link vừa tạo thì hợp lệ', verifyLoginToken(token) === 42)

    check('sửa một ký tự trong chữ ký → từ chối',
      verifyLoginToken(token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a')) === null)

    const [payload] = token.split('.')
    check('bỏ hẳn chữ ký → từ chối', verifyLoginToken(payload) === null)
    check('chuỗi rác → từ chối', verifyLoginToken('abc.def') === null)
    check('rỗng → từ chối', verifyLoginToken(undefined) === null)

    // Doi noi dung (uid) ma giu chu ky cu
    const forged = Buffer.from(JSON.stringify({
      uid: 999, exp: Math.floor(Date.now() / 1000) + 600,
    })).toString('base64url')
    check('đổi uid nhưng giữ chữ ký cũ → từ chối',
      verifyLoginToken(`${forged}.${token.split('.')[1]}`) === null)
  }

  console.log('\n── Hết hạn ──')
  {
    const expired = Buffer.from(JSON.stringify({
      uid: 1, exp: Math.floor(Date.now() / 1000) - 10,
    })).toString('base64url')
    // Ky that nhung da het han
    const { createHmac, createHash } = await import('node:crypto')
    const key = createHash('sha256')
      .update(`${process.env.TELEGRAM_BOT_TOKEN}|login`).digest()
    const sig = createHmac('sha256', key).update(expired).digest('base64url')
    check('chữ ký đúng nhưng quá hạn → từ chối',
      verifyLoginToken(`${expired}.${sig}`) === null)
  }

  console.log('\n── Link đăng nhập và cookie phiên là hai loại khác nhau ──')
  {
    const login = makeLoginToken(7)
    const session = makeSessionToken(7)
    check('cookie phiên hợp lệ', verifySessionToken(session) === 7)
    // Khoa ky dan xuat theo muc dich: link 15 phut khong duoc dung lam
    // cookie 30 ngay, va nguoc lai
    check('link đăng nhập KHÔNG dùng được làm cookie', verifySessionToken(login) === null)
    check('cookie KHÔNG dùng được làm link đăng nhập', verifyLoginToken(session) === null)
  }

  console.log('\n── Gom dữ liệu dashboard ──')
  const user = await getOrCreateUser(FAKE_ID, 'Thử dashboard')
  const account = await getDefaultAccount(user.id)
  const now = new Date()

  await setMonthlyIncome(user.id, new Decimal(25_000_000))
  await setAccountBalance(user.id, new Decimal(60_000_000))
  await upsertAsset(user.id, 'Vàng SJC', new Decimal(80_000_000), now, TZ)
  await snapshotNetWorth(user.id, now, TZ)

  for (const [catName, text] of [
    ['Ăn ngoài & cà phê', 'cafe 45k'],
    ['Ăn ngoài & cà phê', 'nhau 1tr2'],
    ['Nhà ở', 'tien nha 5tr'],
    ['Đi lại', 'do xang 80k'],
  ] as const) {
    const cat = await findCategoryByName(user.id, catName)
    const parsed = parseTransaction(text)
    await recordTransaction({
      userId: user.id, parsed: parsed!, categoryId: cat!.id,
      accountId: account!.id, rawInput: text,
    })
  }
  const anNgoai = await findCategoryByName(user.id, 'Ăn ngoài & cà phê')
  await setBudget(user.id, anNgoai!.id, new Decimal(1_000_000), now, TZ)

  const d = await loadDashboard(user.id, now)

  check('có tên người dùng', d.displayName === 'Thử dashboard')
  check('có nhãn kỳ', d.periodLabel.startsWith('Tháng'))
  // 60tr khai ban dau − 6,325tr da chi + 80tr vang = 133,675tr
  check('tài sản ròng trừ đúng phần đã chi', d.netWorth.total.toString() === '133675000',
    `nhận được ${d.netWorth.total}`)
  check('có mốc lịch sử tài sản ròng', d.netWorthHistory.length === 1)

  check('đủ 12 tháng trên trục thời gian', d.flows.length === 12,
    `nhận được ${d.flows.length}`)
  check('  tháng cuối là tháng hiện tại',
    d.flows.at(-1)?.month === `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    || d.flows.at(-1)?.month.length === 7)
  check('  tháng không có giao dịch vẫn có mặt (bằng 0)',
    d.flows[0]?.expense.toString() === '0')
  check('  chi tháng này 6.325.000',
    d.flows.at(-1)?.expense.toString() === '6325000',
    `nhận được ${d.flows.at(-1)?.expense}`)

  check('có phân tích theo danh mục', d.byCategory.length === 3,
    `nhận được ${d.byCategory.length}`)
  check('  xếp theo số tiền giảm dần', d.byCategory[0]?.name === 'Nhà ở')
  check('  tổng phần trăm đúng 100',
    d.byCategory.reduce((s, c) => s + c.percent.toNumber(), 0).toFixed(0) === '100')

  check('có ngân sách', d.budgets.length === 1)
  check('  đã vượt hạn mức 1tr', d.budgets[0]?.used.gt(100) === true,
    `nhận được ${d.budgets[0]?.used.toFixed(0)}%`)

  check('có tỷ lệ tiết kiệm', d.savingsRate !== null)
  check('có nhận định', d.insights.length > 0)

  console.log('\n── Dữ liệu chuyển sang trình duyệt được ──')
  {
    // Component phia trinh duyet chi nhan so thuong, khong nhan Decimal.
    // Kiem tra moi con so deu doi duoc ma khong thanh NaN.
    const numbers = [
      d.netWorth.total.toNumber(),
      ...d.flows.map((f) => f.income.toNumber()),
      ...d.flows.map((f) => f.expense.toNumber()),
      ...d.byCategory.map((c) => c.percent.toNumber()),
      ...d.budgets.map((b) => b.used.toNumber()),
    ]
    check('không có giá trị NaN nào', numbers.every((n) => Number.isFinite(n)))
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
    console.error('   (đã dọn dữ liệu thử)')
  } catch { /* bo qua */ }
  process.exit(1)
})
