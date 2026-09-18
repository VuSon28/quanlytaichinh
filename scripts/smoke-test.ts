/**
 * Chay thu toan bo luong ghi so tren database THAT.
 * Chay: npx tsx --env-file=.env.local scripts/smoke-test.ts
 *
 * Dung mot telegram id gia (so am) de khong dung vao du lieu that cua
 * ban, va don sach sau khi chay xong.
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db'
import { parseTransaction } from '../src/lib/parser'
import { formatVnd } from '../src/lib/money'
import { SEED_CATEGORIES } from '../src/lib/categories'
import {
  getOrCreateUser, loadLearnedKeywords, learnKeyword, findCategoryByName,
  getDefaultAccount, recordTransaction, listRecent, totalsBetween,
} from '../src/lib/ledger'

const FAKE_TELEGRAM_ID = -999001

async function main() {
  console.log('\n── 1. Tạo người dùng thử + danh mục mặc định ──')
  const user = await getOrCreateUser(FAKE_TELEGRAM_ID, 'Người dùng thử')
  console.log(`   user id = ${user.id}`)

  const cats = await db.query.categories.findMany({
    where: eq(schema.categories.userId, user.id),
  })
  console.log(`   đã tạo ${cats.length} danh mục`)
  if (cats.length !== SEED_CATEGORIES.length) {
    throw new Error(`mong đợi ${SEED_CATEGORIES.length} danh mục, nhận ${cats.length}`)
  }

  const account = await getDefaultAccount(user.id)
  if (!account) throw new Error('không tạo được ví mặc định')
  console.log(`   ví mặc định: ${account.name}, số dư ${formatVnd(account.balance)}`)

  console.log('\n── 2. Ghi vài giao dịch như người dùng thật ──')
  const inputs = ['cafe 45k', 'đổ xăng 80k', 'ăn trưa 55 nghìn', '+20tr lương']

  for (const text of inputs) {
    const learned = await loadLearnedKeywords(user.id)
    const parsed = parseTransaction(text, learned)
    if (!parsed) throw new Error(`không đọc được: ${text}`)
    if (!parsed.categoryName) throw new Error(`không đoán được danh mục: ${text}`)

    const cat = await findCategoryByName(user.id, parsed.categoryName)
    if (!cat) throw new Error(`không tìm thấy danh mục ${parsed.categoryName}`)

    await recordTransaction({
      userId: user.id,
      parsed,
      categoryId: cat.id,
      accountId: account.id,
      rawInput: text,
    })
    if (parsed.note) await learnKeyword(user.id, parsed.note, cat.id)

    const sign = parsed.type === 'income' ? '+' : '−'
    console.log(`   "${text}" → ${cat.icon} ${cat.name}  ${sign}${formatVnd(parsed.amount)}`)
  }

  console.log('\n── 3. Đọc lại từ database ──')
  const recent = await listRecent(user.id, 10)
  console.log(`   đọc được ${recent.length} giao dịch`)
  if (recent.length !== 4) throw new Error(`mong đợi 4 giao dịch, nhận ${recent.length}`)

  console.log('\n── 4. Kiểm tra số dư ví đã cập nhật ──')
  const after = await getDefaultAccount(user.id)
  // 20.000.000 thu − (45.000 + 80.000 + 55.000) chi = 19.820.000
  console.log(`   số dư: ${formatVnd(after!.balance)}`)
  if (Number(after!.balance) !== 19_820_000) {
    throw new Error(`số dư sai, mong đợi 19.820.000, nhận ${after!.balance}`)
  }

  console.log('\n── 5. Tổng hợp theo danh mục ──')
  const now = new Date()
  const t = await totalsBetween(
    user.id,
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(now.getFullYear(), now.getMonth() + 1, 1),
  )
  console.log(`   Chi: ${formatVnd(t.expense)}   Thu: ${formatVnd(t.income)}`)
  for (const c of t.byCategory) {
    console.log(`     ${c.icon} ${c.name} (${c.kind}) — ${formatVnd(c.total)}`)
  }
  if (Number(t.expense) !== 180_000) throw new Error(`tổng chi sai: ${t.expense}`)
  if (Number(t.income) !== 20_000_000) throw new Error(`tổng thu sai: ${t.income}`)

  console.log('\n── 6. Bộ nhớ từ khoá đã học ──')
  const learned = await loadLearnedKeywords(user.id)
  console.log(`   đã nhớ ${learned.size} từ khoá:`)
  for (const [kw, cat] of learned) console.log(`     "${kw}" → ${cat}`)

  console.log('\n── 7. Dọn dẹp dữ liệu thử ──')
  await db.delete(schema.users).where(eq(schema.users.id, user.id))
  const left = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, FAKE_TELEGRAM_ID),
  })
  if (left) throw new Error('xoá không sạch')
  console.log('   đã xoá sạch (cascade hoạt động đúng)')

  console.log(`\n${'─'.repeat(50)}`)
  console.log('TẤT CẢ ĐỀU ĐẠT — database và tầng ghi sổ hoạt động đúng')
  console.log(`${'─'.repeat(50)}\n`)
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('\n❌ HỎNG:', e.message)
    // Co gang don du lieu thu du co loi, de lan chay sau khong bi ban
    try {
      await db.delete(schema.users).where(eq(schema.users.telegramId, FAKE_TELEGRAM_ID))
      console.error('   (đã dọn dữ liệu thử)')
    } catch { /* bo qua */ }
    process.exit(1)
  })
