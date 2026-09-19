/**
 * Kiem thu import sao ke tren database THAT.
 * Chay: npm run test:import
 *
 * Tinh chat quan trong nhat: gui lai cung mot file KHONG duoc sinh ban
 * trung. Nguoi dung se import lai - vi khong nho da lam chua, vi bam
 * nham, vi tai lai sao ke moi co them vai dong. Neu moi lan import la
 * mot lan nhan doi so lieu thi ca cuon so thanh rac.
 */
import ExcelJS from 'exceljs'
import Decimal from 'decimal.js'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db'
import { formatVnd } from '../src/lib/money'
import { getOrCreateUser, getDefaultAccount, setAccountBalance } from '../src/lib/ledger'
import { parseStatementFile, prepareImport, commitImport } from '../src/lib/import'

const FAKE_ID = -999004

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`) }
}

const CSV = [
  'NGAN HANG TMCP A',
  'So tai khoan: 0011001234567',
  '',
  'Ngay giao dich,So tham chieu,Ghi no,Ghi co,So du,Noi dung',
  '01/09/2026,FT001,"45.000",,"12.955.000","THANH TOAN HIGHLANDS COFFEE"',
  '02/09/2026,FT002,"80.000",,"12.875.000","DO XANG PETROLIMEX"',
  '03/09/2026,FT003,"1.200.000",,"11.675.000","TIEN NHA THANG 9"',
  '05/09/2026,FT004,,"25.000.000","36.675.000","LUONG THANG 9"',
  '07/09/2026,FT005,"620.000",,"36.055.000","TIEN DIEN EVN"',
  '',
  'Tong cong,,1.945.000,25.000.000,,',
].join('\n')

async function main() {
  const user = await getOrCreateUser(FAKE_ID, 'Thử import')
  const account = await getDefaultAccount(user.id)
  if (!account) throw new Error('thiếu ví mặc định')
  await setAccountBalance(user.id, new Decimal(50_000_000))

  console.log('\n── Đọc file CSV ──')
  const parsed = await parseStatementFile(Buffer.from(CSV, 'utf8'), 'sao-ke.csv')
  check('đọc được 5 giao dịch', parsed.rows.length === 5,
    `nhận được ${parsed.rows.length}`)
  check('bỏ qua dòng đầu và dòng tổng', parsed.skipped.length >= 1)

  console.log('\n── Tự phân loại từ nội dung sao kê ──')
  const preview = await prepareImport(user.id, parsed)
  const byDesc = new Map(preview.prepared.map((r) => [r.description, r.categoryName]))
  check('HIGHLANDS COFFEE → Ăn ngoài & cà phê',
    byDesc.get('THANH TOAN HIGHLANDS COFFEE') === 'Ăn ngoài & cà phê',
    `nhận được ${byDesc.get('THANH TOAN HIGHLANDS COFFEE')}`)
  check('DO XANG → Đi lại',
    byDesc.get('DO XANG PETROLIMEX') === 'Đi lại',
    `nhận được ${byDesc.get('DO XANG PETROLIMEX')}`)
  check('TIEN NHA → Nhà ở',
    byDesc.get('TIEN NHA THANG 9') === 'Nhà ở',
    `nhận được ${byDesc.get('TIEN NHA THANG 9')}`)
  check('LUONG → Lương (khoản thu)',
    byDesc.get('LUONG THANG 9') === 'Lương',
    `nhận được ${byDesc.get('LUONG THANG 9')}`)
  check('TIEN DIEN → Điện nước internet',
    byDesc.get('TIEN DIEN EVN') === 'Điện nước internet',
    `nhận được ${byDesc.get('TIEN DIEN EVN')}`)

  console.log('\n── Tổng hợp trước khi ghi ──')
  check('5 giao dịch mới', preview.newCount === 5)
  check('chưa có bản trùng nào', preview.duplicateCount === 0)
  check('tổng chi 1.945.000', preview.totalExpense.toString() === '1945000',
    `nhận được ${preview.totalExpense}`)
  check('tổng thu 25.000.000', preview.totalIncome.toString() === '25000000')

  console.log('\n── Ghi vào sổ ──')
  const n1 = await commitImport(user.id, preview, account.id)
  check('ghi được 5 giao dịch', n1 === 5, `nhận được ${n1}`)
  {
    const after = await getDefaultAccount(user.id)
    // 50tr + 25tr thu − 1,945tr chi = 73.055.000
    check('số dư cập nhật đúng', after?.balance === '73055000.00',
      `nhận được ${after?.balance}`)
    console.log(`        số dư: ${formatVnd(after!.balance)}`)
  }

  console.log('\n── Import LẠI cùng file → không được ghi trùng ──')
  {
    const again = await parseStatementFile(Buffer.from(CSV, 'utf8'), 'sao-ke.csv')
    const p2 = await prepareImport(user.id, again)
    check('nhận ra cả 5 dòng đã có sẵn', p2.duplicateCount === 5,
      `nhận được ${p2.duplicateCount}`)
    check('không còn dòng mới nào', p2.newCount === 0)

    const n2 = await commitImport(user.id, p2, account.id)
    check('ghi thêm 0 giao dịch', n2 === 0, `nhận được ${n2}`)

    const total = await db.query.transactions.findMany({
      where: eq(schema.transactions.userId, user.id),
    })
    check('sổ vẫn đúng 5 giao dịch', total.length === 5, `nhận được ${total.length}`)

    const after = await getDefaultAccount(user.id)
    check('số dư KHÔNG bị cộng hai lần', after?.balance === '73055000.00',
      `nhận được ${after?.balance}`)
  }

  console.log('\n── File có thêm dòng mới → chỉ ghi phần mới ──')
  {
    const extended = CSV.replace(
      '\nTong cong',
      '\n10/09/2026,FT006,"250.000",,"35.805.000","SIEU THI WINMART"\nTong cong',
    )
    const p3 = await prepareImport(
      user.id,
      await parseStatementFile(Buffer.from(extended, 'utf8'), 'sao-ke.csv'),
    )
    check('5 dòng cũ nhận ra là trùng', p3.duplicateCount === 5)
    check('1 dòng mới', p3.newCount === 1)
    const n3 = await commitImport(user.id, p3, account.id)
    check('chỉ ghi thêm 1', n3 === 1, `nhận được ${n3}`)
  }

  console.log('\n── Đọc file Excel ──')
  {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sao ke')
    ws.addRow(['BAO CAO GIAO DICH'])
    ws.addRow([])
    ws.addRow(['Ngay giao dich', 'Noi dung', 'Ghi no', 'Ghi co'])
    ws.addRow(['15/09/2026', 'GRAB CHUYEN DI', '95000', ''])
    ws.addRow(['16/09/2026', 'CAFE THE COFFEE HOUSE', '68000', ''])

    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    const xlsxParsed = await parseStatementFile(buf, 'sao-ke.xlsx')
    check('đọc được 2 giao dịch từ Excel', xlsxParsed.rows.length === 2,
      `nhận được ${xlsxParsed.rows.length}`)
    check('  bỏ qua 2 dòng đầu không phải bảng', xlsxParsed.detected.date === 'Ngay giao dich')
    check('  số tiền đúng', xlsxParsed.rows[0]?.amount.toString() === '95000',
      `nhận được ${xlsxParsed.rows[0]?.amount}`)

    const p4 = await prepareImport(user.id, xlsxParsed)
    check('  GRAB → Đi lại', p4.prepared[0]?.categoryName === 'Đi lại',
      `nhận được ${p4.prepared[0]?.categoryName}`)
  }

  console.log('\n── File sai định dạng thì báo lỗi rõ ──')
  {
    try {
      await parseStatementFile(Buffer.from('nothing'), 'anh.jpg')
      check('file .jpg → phải báo lỗi', false)
    } catch (e) {
      check('file .jpg → báo lỗi rõ ràng', (e as Error).message.includes('.csv'))
      console.log(`        "${(e as Error).message.slice(0, 60)}..."`)
    }
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
