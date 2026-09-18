/**
 * Kiem thu bo doc tieng Viet.
 * Chay: npx tsx scripts/test-parser.ts
 *
 * Khong dung test framework - day la mot script chay thang, de ban tu
 * them dong vao khi phat hien bot doc sai mot cach viet nao do.
 */
import { parseAmount, extractAmount, formatVnd, formatShort } from '../src/lib/money'
import { parseTransaction } from '../src/lib/parser'

let pass = 0
let fail = 0

function eq(label: string, actual: unknown, expected: unknown) {
  const a = String(actual)
  const e = String(expected)
  if (a === e) {
    pass++
    console.log(`  ok    ${label}`)
  } else {
    fail++
    console.log(`  FAIL  ${label}\n          mong doi: ${e}\n          nhan duoc: ${a}`)
  }
}

console.log('\n── Đọc số tiền ──')
eq('45k', parseAmount('45k'), '45000')
eq('45K', parseAmount('45K'), '45000')
eq('45n', parseAmount('45n'), '45000')
eq('45 nghìn', parseAmount('45 nghìn'), '45000')
eq('45 ngan', parseAmount('45 ngan'), '45000')
eq('1tr', parseAmount('1tr'), '1000000')
eq('1 triệu', parseAmount('1 triệu'), '1000000')
eq('1tr2  → 1,2tr', parseAmount('1tr2'), '1200000')
eq('1tr25 → 1,25tr', parseAmount('1tr25'), '1250000')
eq('1tr200', parseAmount('1tr200'), '1200000')
eq('1.2tr', parseAmount('1.2tr'), '1200000')
eq('1,5tr', parseAmount('1,5tr'), '1500000')
eq('2ty5  → 2,5 tỷ', parseAmount('2ty5'), '2500000000')
eq('1 tỷ', parseAmount('1 tỷ'), '1000000000')
eq('45.000', parseAmount('45.000'), '45000')
eq('45,000', parseAmount('45,000'), '45000')
eq('1.200.000', parseAmount('1.200.000'), '1200000')
eq('45 (số trần nhỏ → nghìn)', parseAmount('45'), '45000')
eq('45000 (số trần lớn → giữ nguyên)', parseAmount('45000'), '45000')
eq('chữ vô nghĩa → null', parseAmount('abc'), 'null')

console.log('\n── Tách số tiền khỏi câu ──')
eq('cafe 45k', extractAmount('cafe 45k')?.amount, '45000')
eq('đổ xăng 80k', extractAmount('đổ xăng 80k')?.amount, '80000')
eq('ăn trưa 55 nghìn', extractAmount('ăn trưa 55 nghìn')?.amount, '55000')
eq('lương tháng 9 là 25tr', extractAmount('lương tháng 9 là 25tr')?.amount, '25000000')
eq('không có số', extractAmount('hôm nay trời đẹp'), 'null')

console.log('\n── Định dạng hiển thị ──')
eq('45000 → 45.000 đ', formatVnd(45000), '45.000 đ')
eq('1200000 → 1.200.000 đ', formatVnd(1200000), '1.200.000 đ')
eq('45000 → 45k', formatShort(45000), '45k')
eq('1200000 → 1,2tr', formatShort(1200000), '1,2tr')
eq('2500000000 → 2,5tỷ', formatShort(2500000000), '2,5tỷ')

console.log('\n── Đọc cả giao dịch ──')
const cases: Array<[string, { type: string; amount: string; cat: string | null }]> = [
  ['cafe 45k', { type: 'expense', amount: '45000', cat: 'Ăn ngoài & cà phê' }],
  ['đổ xăng 80k', { type: 'expense', amount: '80000', cat: 'Đi lại' }],
  ['ăn trưa 55 nghìn', { type: 'expense', amount: '55000', cat: 'Ăn uống thiết yếu' }],
  ['tiền điện 450k', { type: 'expense', amount: '450000', cat: 'Điện nước internet' }],
  ['grab 32k', { type: 'expense', amount: '32000', cat: 'Đi lại' }],
  ['thuốc 120k', { type: 'expense', amount: '120000', cat: 'Sức khỏe' }],
  ['gửi tiết kiệm 5tr', { type: 'expense', amount: '5000000', cat: 'Tiết kiệm' }],
  ['+20tr lương', { type: 'income', amount: '20000000', cat: 'Lương' }],
  ['nhận lương 25tr', { type: 'income', amount: '25000000', cat: 'Lương' }],
  ['thưởng tết 30tr', { type: 'income', amount: '30000000', cat: 'Thưởng' }],
  ['xyz lạ hoắc 99k', { type: 'expense', amount: '99000', cat: null }],
]

for (const [input, want] of cases) {
  const got = parseTransaction(input)
  if (!got) {
    fail++
    console.log(`  FAIL  "${input}" → không đọc được`)
    continue
  }
  const ok =
    got.type === want.type &&
    got.amount.toString() === want.amount &&
    got.categoryName === want.cat
  if (ok) {
    pass++
    console.log(`  ok    "${input}" → ${want.cat ?? '(hỏi lại)'} ${want.amount}`)
  } else {
    fail++
    console.log(
      `  FAIL  "${input}"\n` +
      `          mong đợi: ${want.type} ${want.amount} ${want.cat}\n` +
      `          nhận được: ${got.type} ${got.amount} ${got.categoryName}`,
    )
  }
}

console.log('\n── Phần mô tả sau khi tách số tiền ──')
// Bo test nay sinh ra tu mot loi that: "55 nghìn" tung bi cat thanh
// "55 n" + "ghìn", khien bot hoc nham tu khoa "an trua ghin".
{
  const notes: Array<[string, string]> = [
    ['ăn trưa 55 nghìn', 'ăn trưa'],
    ['ăn trưa 55 ngàn', 'ăn trưa'],
    ['cafe 45k', 'cafe'],
    ['đổ xăng 80 nghin', 'đổ xăng'],
    ['tiền nhà 3 triệu', 'tiền nhà'],
    ['mua vàng 2ty5', 'mua vàng'],
    ['gửi tiết kiệm 1tr2', 'gửi tiết kiệm'],
    ['thuê xe 500 ngàn', 'thuê xe'],
  ]
  for (const [input, want] of notes) {
    eq(`"${input}" → mô tả "${want}"`, parseTransaction(input)?.note, want)
  }
}

console.log('\n── Bộ nhớ đã học đè lên từ điển mặc định ──')
{
  // Ban tung day bot rang "com tam" thuoc "An uong thiet yeu",
  // du tu dien mac dinh khong co tu nay.
  const learned = new Map([['com tam', 'Ăn uống thiết yếu']])
  const got = parseTransaction('cơm tấm 40k', learned)
  eq('cơm tấm 40k → Ăn uống thiết yếu', got?.categoryName, 'Ăn uống thiết yếu')
  eq('  và độ tin cậy là exact', got?.confidence, 'exact')
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`Đạt: ${pass}   Hỏng: ${fail}`)
console.log(`${'─'.repeat(50)}\n`)
process.exit(fail > 0 ? 1 : 0)
