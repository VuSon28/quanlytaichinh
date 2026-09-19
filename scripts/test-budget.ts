/**
 * Kiem thu ngan sach tren database THAT.
 * Chay: npm run test:budget
 *
 * Trong tam la tinh chat chong lam phien: moi danh muc moi thang chi
 * duoc canh bao dung HAI lan (80% va 100%), du ban ghi them bao nhieu
 * giao dich nua. Day la thu de hong nhat va cung la thu khien nguoi
 * dung tat thong bao neu lam sai.
 */
import Decimal from 'decimal.js'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db'
import { formatVnd } from '../src/lib/money'
import { parseTransaction } from '../src/lib/parser'
import {
  getOrCreateUser, findCategoryByName, getDefaultAccount, recordTransaction,
} from '../src/lib/ledger'
import {
  setBudget, listBudgets, checkBudgetAlert, findCategoryLoose, removeBudget,
} from '../src/lib/budget'

const FAKE_ID = -999002
const TZ = 'Asia/Ho_Chi_Minh'

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`) }
}

async function spend(userId: number, catId: number, accountId: number, text: string) {
  const parsed = parseTransaction(text)
  if (!parsed) throw new Error(`không đọc được: ${text}`)
  await recordTransaction({
    userId, parsed, categoryId: catId, accountId, rawInput: text,
  })
  return checkBudgetAlert(userId, catId, new Date(), TZ)
}

async function main() {
  const user = await getOrCreateUser(FAKE_ID, 'Thử ngân sách')
  const account = await getDefaultAccount(user.id)
  const cat = await findCategoryByName(user.id, 'Ăn ngoài & cà phê')
  if (!account || !cat) throw new Error('thiếu ví hoặc danh mục mặc định')

  console.log('\n── Tìm danh mục không cần gõ dấu ──')
  {
    const byLoose = await findCategoryLoose(user.id, 'an ngoai')
    check('"an ngoai" → Ăn ngoài & cà phê', byLoose?.id === cat.id)
    const byPartial = await findCategoryLoose(user.id, 'ĐI LẠI')
    check('"ĐI LẠI" viết hoa vẫn tìm ra', byPartial?.name === 'Đi lại')
    const nope = await findCategoryLoose(user.id, 'khong ton tai xyz')
    check('tên không có thật → null', nope === null)
  }

  console.log('\n── Đặt ngân sách 1 triệu ──')
  await setBudget(user.id, cat.id, new Decimal(1_000_000), new Date(), TZ)
  {
    const rows = await listBudgets(user.id, new Date(), TZ)
    check('có 1 dòng ngân sách', rows.length === 1)
    check('hạn mức đúng 1.000.000', rows[0]?.amount.toString() === '1000000')
    check('đã tiêu 0', rows[0]?.spent.toString() === '0')
  }

  console.log('\n── Chưa tới ngưỡng thì im lặng ──')
  {
    const a1 = await spend(user.id, cat.id, account.id, 'cafe 300k')
    check('tiêu 300k (30%) → không cảnh báo', a1 === null)
    const a2 = await spend(user.id, cat.id, account.id, 'tra sua 400k')
    check('tiêu thêm 400k (70%) → vẫn không cảnh báo', a2 === null)
  }

  console.log('\n── Chạm 80% thì cảnh báo ──')
  {
    const a = await spend(user.id, cat.id, account.id, 'nhau 150k')
    check('tổng 850k (85%) → CÓ cảnh báo', a !== null)
    check('  đúng ngưỡng 80', a?.threshold === 80)
    check('  còn lại 150.000đ', a?.remaining.toString() === '150000',
      `nhận được ${a?.remaining}`)
  }

  console.log('\n── Không cảnh báo lại trong cùng ngưỡng ──')
  {
    const a1 = await spend(user.id, cat.id, account.id, 'cafe 50k')
    check('tiêu thêm 50k (90%) → IM LẶNG', a1 === null,
      `nhận được cảnh báo ngưỡng ${a1?.threshold}`)
    const a2 = await spend(user.id, cat.id, account.id, 'cafe 50k')
    check('tiêu thêm 50k nữa (95%) → vẫn IM LẶNG', a2 === null)
  }

  console.log('\n── Vượt 100% thì cảnh báo lần cuối ──')
  {
    const a = await spend(user.id, cat.id, account.id, 'buffet 200k')
    check('tổng 1.15tr (115%) → CÓ cảnh báo', a !== null)
    check('  đúng ngưỡng 100', a?.threshold === 100)
    check('  báo vượt 150.000đ', a?.remaining.toString() === '-150000',
      `nhận được ${a?.remaining}`)
  }

  console.log('\n── Sau 100% thì im hẳn ──')
  {
    const a1 = await spend(user.id, cat.id, account.id, 'cafe 500k')
    check('tiêu thêm 500k (165%) → IM LẶNG', a1 === null,
      `nhận được cảnh báo ngưỡng ${a1?.threshold}`)
    const a2 = await spend(user.id, cat.id, account.id, 'cafe 500k')
    check('tiêu thêm 500k nữa → vẫn IM LẶNG', a2 === null)
  }

  console.log('\n── Đổi hạn mức thì đặt lại từ đầu ──')
  {
    // Da tieu 2,15tr. Nang han muc len 5tr -> moi chi dung 43%
    await setBudget(user.id, cat.id, new Decimal(5_000_000), new Date(), TZ)
    const rows = await listBudgets(user.id, new Date(), TZ)
    check('tỷ lệ dùng tính lại theo hạn mức mới', rows[0]?.used.toFixed(0) === '43',
      `nhận được ${rows[0]?.used.toFixed(0)}%`)
    const a = await spend(user.id, cat.id, account.id, 'cafe 100k')
    check('chưa tới 80% hạn mức mới → im lặng', a === null)
  }

  console.log('\n── Danh mục không đặt ngân sách thì không bao giờ cảnh báo ──')
  {
    const other = await findCategoryByName(user.id, 'Đi lại')
    const a = await spend(user.id, other!.id, account.id, 'do xang 9tr')
    check('tiêu 9 triệu ở mục không có ngân sách → im lặng', a === null)
  }

  console.log('\n── Xoá ngân sách ──')
  {
    await removeBudget(user.id, cat.id, new Date(), TZ)
    const rows = await listBudgets(user.id, new Date(), TZ)
    check('không còn dòng nào', rows.length === 0)
  }

  console.log('\n── Dọn dẹp ──')
  await db.delete(schema.users).where(eq(schema.users.id, user.id))
  const left = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, FAKE_ID),
  })
  check('đã xoá sạch dữ liệu thử', !left)

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
