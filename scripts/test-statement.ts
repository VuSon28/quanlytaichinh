/**
 * Kiem thu bo doc sao ke ngan hang.
 * Chay: npm run test:statement
 *
 * Cac bang mau duoi day mo phong dinh dang xuat that cua vai ngan hang
 * Viet Nam pho bien. Trong tam la: doc dung so tien (nham dau phay voi
 * dau cham la sai ca nghin lan), doc dung chieu tien, va khong ghi trung
 * khi import lai cung mot file.
 */
import { parseCsv, parseTable, parseStatementAmount, parseStatementDate } from '../src/lib/statement'

let pass = 0
let fail = 0

function eq(label: string, actual: unknown, expected: unknown) {
  const a = String(actual)
  const e = String(expected)
  if (a === e) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}\n          mong đợi: ${e}\n          nhận được: ${a}`) }
}

console.log('\n── Đọc số tiền trong sao kê ──')
eq('1.234.567 → 1234567', parseStatementAmount('1.234.567'), '1234567')
eq('1,234,567 → 1234567', parseStatementAmount('1,234,567'), '1234567')
eq('1,234,567.89 → 1234567.89', parseStatementAmount('1,234,567.89'), '1234567.89')
eq('1.234.567,89 → 1234567.89', parseStatementAmount('1.234.567,89'), '1234567.89')
eq('45000 → 45000', parseStatementAmount('45000'), '45000')
eq('45000 VND → 45000', parseStatementAmount('45000 VND'), '45000')
eq('45.000 đ → 45000', parseStatementAmount('45.000 đ'), '45000')
eq('-250000 → -250000', parseStatementAmount('-250000'), '-250000')
eq('(250.000) kế toán → -250000', parseStatementAmount('(250.000)'), '-250000')
eq('ô trống → null', parseStatementAmount(''), 'null')
eq('gạch ngang → null', parseStatementAmount('-'), 'null')
eq('chữ → null', parseStatementAmount('abc'), 'null')

console.log('\n── KHÔNG đoán "45 nghĩa là 45 nghìn" trong sao kê ──')
// Khac han money.ts: sao ke luon ghi so tien day du, doan them la sai
eq('45 → 45 (không phải 45000)', parseStatementAmount('45'), '45')

console.log('\n── Đọc ngày ──')
eq('18/09/2026', parseStatementDate('18/09/2026')?.toISOString().slice(0, 10), '2026-09-18')
eq('18-09-2026', parseStatementDate('18-09-2026')?.toISOString().slice(0, 10), '2026-09-18')
eq('2026-09-18', parseStatementDate('2026-09-18')?.toISOString().slice(0, 10), '2026-09-18')
eq('18/09/2026 14:30 giữ giờ', parseStatementDate('18/09/2026 14:30')?.toISOString(), '2026-09-18T14:30:00.000Z')
eq('ngày 32 không hợp lệ → null', parseStatementDate('32/09/2026'), 'null')
eq('ô trống → null', parseStatementDate(''), 'null')

console.log('\n── Kiểu Vietcombank: hai cột Ghi nợ / Ghi có ──')
{
  const csv = [
    'NGAN HANG TMCP NGOAI THUONG VIET NAM',
    'So tai khoan: 0011001234567',
    'Ky sao ke: 01/09/2026 - 30/09/2026',
    '',
    'Ngay giao dich,So tham chieu,Ghi no,Ghi co,So du,Noi dung',
    '01/09/2026,FT26245001,"45.000",,"12.955.000","THANH TOAN QR HIGHLANDS COFFEE"',
    '03/09/2026,FT26247002,"1.200.000",,"11.755.000","CHUYEN TIEN TIEN NHA THANG 9"',
    '05/09/2026,FT26249003,,"25.000.000","36.755.000","LUONG THANG 9 CTY ABC"',
    '',
    'Tong cong,,1.245.000,25.000.000,,',
  ].join('\n')

  const r = parseTable(parseCsv(csv))
  eq('đọc được 3 giao dịch', r.rows.length, 3)
  eq('  nhận đúng cột ngày', r.detected.date, 'Ngay giao dich')
  eq('  nhận đúng cột ghi nợ', r.detected.debit, 'Ghi no')
  eq('  nhận đúng cột ghi có', r.detected.credit, 'Ghi co')
  eq('  bỏ qua 5 dòng đầu + dòng tổng', r.skipped.length >= 1, 'true')

  eq('giao dịch 1 là khoản chi', r.rows[0]?.type, 'expense')
  eq('  số tiền 45.000', r.rows[0]?.amount.toString(), '45000')
  eq('  nội dung giữ nguyên', r.rows[0]?.description.includes('HIGHLANDS'), 'true')
  eq('giao dịch 3 là khoản thu', r.rows[2]?.type, 'income')
  eq('  số tiền 25 triệu', r.rows[2]?.amount.toString(), '25000000')
}

console.log('\n── Kiểu một cột số tiền có dấu âm ──')
{
  const csv = [
    'Date;Description;Amount;Balance',
    '01/09/2026;GRAB RIDE;-85000;12915000',
    '02/09/2026;REFUND SHOPEE;+150000;13065000',
    '03/09/2026;VINMART;-320500;12744500',
  ].join('\n')

  const r = parseTable(parseCsv(csv))
  eq('đọc được 3 giao dịch', r.rows.length, 3)
  eq('  nhận ra dấu chấm phẩy làm phân cách', r.detected.date, 'Date')
  eq('  số âm → khoản chi', r.rows[0]?.type, 'expense')
  eq('  85.000', r.rows[0]?.amount.toString(), '85000')
  eq('  số dương → khoản thu', r.rows[1]?.type, 'income')
  eq('  không nhầm cột Balance thành số tiền', r.rows[2]?.amount.toString(), '320500')
}

console.log('\n── Tiêu đề tiếng Anh ──')
{
  const csv = [
    'Transaction Date,Transaction Detail,Debit,Credit',
    '2026-09-10,ATM WITHDRAWAL,2000000,',
    '2026-09-11,SALARY,,30000000',
  ].join('\n')
  const r = parseTable(parseCsv(csv))
  eq('đọc được 2 giao dịch', r.rows.length, 2)
  eq('  rút tiền → chi', r.rows[0]?.type, 'expense')
  eq('  lương → thu', r.rows[1]?.type, 'income')
}

console.log('\n── Chống ghi trùng ──')
{
  const csv = [
    'Ngay,Noi dung,Ghi no,Ghi co',
    '01/09/2026,CAFE,45000,',
    '01/09/2026,CAFE,45000,',
    '01/09/2026,CAFE,50000,',
  ].join('\n')
  const r = parseTable(parseCsv(csv))
  eq('hai dòng y hệt → cùng một vân tay', r.rows[0]?.dedupeHash === r.rows[1]?.dedupeHash, 'true')
  eq('khác số tiền → vân tay khác', r.rows[0]?.dedupeHash !== r.rows[2]?.dedupeHash, 'true')
}

console.log('\n── Dấu ngoặc kép trong nội dung ──')
{
  const csv = [
    'Ngay,Noi dung,So tien',
    '01/09/2026,"CHUYEN KHOAN, NOI DUNG CO DAU PHAY",-100000',
    '02/09/2026,"CO ""NGOAC KEP"" BEN TRONG",-200000',
  ].join('\n')
  const r = parseTable(parseCsv(csv))
  eq('dấu phẩy trong ngoặc kép không cắt cột', r.rows[0]?.description, 'CHUYEN KHOAN, NOI DUNG CO DAU PHAY')
  eq('ngoặc kép lồng đọc đúng', r.rows[1]?.description, 'CO "NGOAC KEP" BEN TRONG')
}

console.log('\n── File hỏng thì báo lỗi rõ ràng ──')
{
  for (const [label, csv] of [
    ['không có cột ngày', 'Noi dung,So tien\nCAFE,45000'],
    ['không có cột tiền', 'Ngay,Noi dung\n01/09/2026,CAFE'],
    ['file rỗng', ''],
  ] as const) {
    try {
      parseTable(parseCsv(csv))
      fail++
      console.log(`  FAIL  ${label} → đáng lẽ phải báo lỗi`)
    } catch (e) {
      pass++
      console.log(`  ok    ${label} → "${(e as Error).message.slice(0, 45)}..."`)
    }
  }
}

console.log('\n── BOM của Excel không làm hỏng tiêu đề ──')
{
  const csv = '﻿Ngay,Noi dung,So tien\n01/09/2026,CAFE,-45000'
  const r = parseTable(parseCsv(csv))
  eq('vẫn nhận ra cột ngày', r.detected.date, 'Ngay')
  eq('đọc được giao dịch', r.rows.length, 1)
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`Đạt: ${pass}   Hỏng: ${fail}`)
console.log(`${'─'.repeat(50)}\n`)
process.exit(fail > 0 ? 1 : 0)
