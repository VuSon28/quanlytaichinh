/**
 * Chay thu bo sinh bao cao dinh ky tren database THAT.
 * Chay: npm run test:digest
 *
 * In ra dung noi dung bot se gui, de doc va danh gia bang mat truoc khi
 * de no tu nhan tin cho nguoi dung that. Mot bao cao sai hoac kho doc
 * thi te hon la khong co bao cao.
 */
import Decimal from 'decimal.js'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db'
import { parseTransaction } from '../src/lib/parser'
import {
  getOrCreateUser, findCategoryByName, getDefaultAccount, recordTransaction,
  setMonthlyIncome,
} from '../src/lib/ledger'
import { setBudget } from '../src/lib/budget'
import { renderDigest } from '../src/lib/digest'

const FAKE_ID = -999003
const TZ = 'Asia/Ho_Chi_Minh'

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`) }
}

function show(title: string, text: string | null) {
  console.log(`\n  ┌─ ${title} ${'─'.repeat(Math.max(0, 44 - title.length))}`)
  if (text === null) {
    console.log('  │ (im lặng — không có gì đáng nói)')
  } else {
    for (const line of text.split('\n')) console.log(`  │ ${line}`)
  }
  console.log(`  └${'─'.repeat(48)}`)
}

async function main() {
  const user = await getOrCreateUser(FAKE_ID, 'Thử báo cáo')
  const account = await getDefaultAccount(user.id)
  if (!account) throw new Error('thiếu ví mặc định')
  const now = new Date()

  console.log('\n── Người dùng chưa ghi gì thì bot im lặng ──')
  {
    check('báo cáo ngày → null', await renderDigest(user.id, 'daily', now, TZ) === null)
    check('báo cáo tuần → null', await renderDigest(user.id, 'weekly', now, TZ) === null)
    check('báo cáo tháng → null', await renderDigest(user.id, 'monthly', now, TZ) === null)
  }

  // Dung du lieu gan giong doi song that
  await setMonthlyIncome(user.id, new Decimal(25_000_000))
  const spends: Array<[string, string]> = [
    ['Ăn ngoài & cà phê', 'cafe 45k'],
    ['Ăn ngoài & cà phê', 'tra sua 60k'],
    ['Ăn ngoài & cà phê', 'nhau 850k'],
    ['Ăn ngoài & cà phê', 'buffet 700k'],
    ['Đi lại', 'do xang 80k'],
    ['Đi lại', 'grab 120k'],
    ['Ăn uống thiết yếu', 'di cho 450k'],
    ['Nhà ở', 'tien nha 5tr'],
    ['Điện nước internet', 'tien dien 620k'],
  ]
  for (const [catName, text] of spends) {
    const cat = await findCategoryByName(user.id, catName)
    const parsed = parseTransaction(text)
    if (!cat || !parsed) throw new Error(`hỏng ở "${text}"`)
    await recordTransaction({
      userId: user.id, parsed, categoryId: cat.id,
      accountId: account.id, rawInput: text,
    })
  }

  // Ngan sach an ngoai 2tr, da tieu 1,655tr -> 83%
  const anNgoai = await findCategoryByName(user.id, 'Ăn ngoài & cà phê')
  await setBudget(user.id, anNgoai!.id, new Decimal(2_000_000), now, TZ)

  console.log('\n── Nội dung báo cáo thật ──')
  const daily = await renderDigest(user.id, 'daily', now, TZ)
  const weekly = await renderDigest(user.id, 'weekly', now, TZ)
  const monthly = await renderDigest(user.id, 'monthly', now, TZ)

  show('HẰNG NGÀY', daily)
  show('HẰNG TUẦN', weekly)
  show('CUỐI THÁNG', monthly)

  console.log('\n── Kiểm tra nội dung ──')
  check('báo cáo tuần có nội dung', weekly !== null)
  check('  nêu tổng chi', weekly?.includes('Chi:') ?? false)
  check('  liệt kê danh mục', weekly?.includes('Ăn ngoài') ?? false)
  check('báo cáo tháng có nội dung', monthly !== null)
  check('  nêu tỷ lệ tiết kiệm', monthly?.includes('Tỷ lệ tiết kiệm') ?? false)

  // Markdown hong se lam Telegram tu choi ca tin nhan
  for (const [name, text] of [['tuần', weekly], ['tháng', monthly]] as const) {
    if (!text) continue
    const stars = (text.match(/\*/g) ?? []).length
    check(`  dấu * trong báo cáo ${name} đủ cặp`, stars % 2 === 0,
      `đếm được ${stars} dấu *, lẻ thì Telegram từ chối cả tin nhắn`)
  }

  console.log('\n── Dọn dẹp ──')
  await db.delete(schema.users).where(eq(schema.users.id, user.id))
  check('đã xoá sạch dữ liệu thử', !(await db.query.users.findFirst({
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
