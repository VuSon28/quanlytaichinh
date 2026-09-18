/**
 * Kiem thu moc thoi gian theo mui gio.
 * Chay: npm run test:time
 *
 * Bo test nay sinh ra tu mot loi that: may chu Vercel chay UTC, nen tu
 * 0h-7h sang gio Viet Nam thi "hom nay" bi tinh thanh ngay hom truoc.
 */
import {
  startOfDay, startOfMonth, addDays, addMonths, daysInMonth,
  zonedParts, monthLabel, shortDate, DEFAULT_TZ,
} from '../src/lib/time'

let pass = 0
let fail = 0

function eq(label: string, actual: unknown, expected: unknown) {
  const a = String(actual)
  const e = String(expected)
  if (a === e) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}\n          mong đợi: ${e}\n          nhận được: ${a}`) }
}

console.log('\n── Giờ Việt Nam sớm hơn UTC 7 tiếng ──')
{
  // 2026-09-18 01:30 gio Viet Nam = 2026-09-17 18:30 UTC
  const earlyMorningVN = new Date('2026-09-17T18:30:00Z')
  const p = zonedParts(earlyMorningVN)
  eq('1h30 sáng 18/9 giờ VN → ngày 18', p.day, 18)
  eq('  (giờ UTC vẫn đang là ngày 17)', earlyMorningVN.getUTCDate(), 17)
  eq('  giờ trong ngày', p.hour, 1)
}

console.log('\n── Đầu ngày ──')
{
  const t = new Date('2026-09-17T18:30:00Z') // 01:30 ngày 18 giờ VN
  const start = startOfDay(t)
  // 0h00 ngay 18 gio VN = 17h00 ngay 17 UTC
  eq('đầu ngày 18/9 giờ VN', start.toISOString(), '2026-09-17T17:00:00.000Z')
  eq('  mốc này TRƯỚC thời điểm đang xét', start < t, 'true')
}

console.log('\n── Đầu tháng ──')
{
  // 2026-10-01 03:00 gio VN = 2026-09-30 20:00 UTC
  const t = new Date('2026-09-30T20:00:00Z')
  eq('3h sáng 1/10 giờ VN → tháng 10', zonedParts(t).month + 1, 10)
  eq('  đầu tháng 10', startOfMonth(t).toISOString(), '2026-09-30T17:00:00.000Z')
  eq('  nhãn tháng', monthLabel(t), 'Tháng 10/2026')
}

console.log('\n── Ranh giới ngày chính xác tới giây ──')
{
  // 23:59:59 ngay 30/9 gio VN = 16:59:59 UTC
  const lastMoment = new Date('2026-09-30T16:59:59Z')
  eq('23h59 ngày 30/9 vẫn là tháng 9', zonedParts(lastMoment).month + 1, 9)

  // 00:00:00 ngay 1/10 gio VN = 17:00:00 UTC
  const firstMoment = new Date('2026-09-30T17:00:00Z')
  eq('0h00 ngày 1/10 đã sang tháng 10', zonedParts(firstMoment).month + 1, 10)
}

console.log('\n── Cộng trừ ngày / tháng ──')
{
  const t = new Date('2026-09-17T18:30:00Z') // 18/9 giờ VN
  eq('+1 ngày → 19/9', zonedParts(addDays(startOfDay(t), 1)).day, 19)
  eq('tháng trước → tháng 8', zonedParts(addMonths(t, -1)).month + 1, 8)
  eq('tháng sau → tháng 10', zonedParts(addMonths(t, 1)).month + 1, 10)
}

console.log('\n── Vượt qua ranh giới năm ──')
{
  // 2027-01-01 05:00 gio VN = 2026-12-31 22:00 UTC
  const t = new Date('2026-12-31T22:00:00Z')
  eq('5h sáng 1/1/2027 giờ VN', monthLabel(t), 'Tháng 1/2027')
  eq('  tháng trước là 12/2026', monthLabel(addMonths(t, -1)), 'Tháng 12/2026')
}

console.log('\n── Số ngày trong tháng ──')
{
  eq('tháng 9/2026', daysInMonth(new Date('2026-09-15T00:00:00Z')), 30)
  eq('tháng 2/2026 (không nhuận)', daysInMonth(new Date('2026-02-15T00:00:00Z')), 28)
  eq('tháng 2/2028 (nhuận)', daysInMonth(new Date('2028-02-15T00:00:00Z')), 29)
}

console.log('\n── Hiển thị ngày ngắn ──')
{
  eq('1h30 sáng 18/9 giờ VN', shortDate(new Date('2026-09-17T18:30:00Z')), '18/09')
}

console.log('\n── Múi giờ khác có giờ mùa hè ──')
{
  // New York: mua he UTC-4, mua dong UTC-5
  const summer = new Date('2026-07-15T03:00:00Z') // 23h ngay 14/7 gio NY
  const winter = new Date('2026-01-15T03:00:00Z') // 22h ngay 14/1 gio NY
  eq('mùa hè: 23h ngày 14/7', zonedParts(summer, 'America/New_York').day, 14)
  eq('mùa đông: 22h ngày 14/1', zonedParts(winter, 'America/New_York').day, 14)
  eq('mặc định vẫn là VN', DEFAULT_TZ, 'Asia/Ho_Chi_Minh')
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`Đạt: ${pass}   Hỏng: ${fail}`)
console.log(`${'─'.repeat(50)}\n`)
process.exit(fail > 0 ? 1 : 0)
