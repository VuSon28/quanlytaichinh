/**
 * Kiem thu bo luat tai chinh.
 * Chay: npm run test:rules
 *
 * Moi ca la mot tinh huong tai chinh cu the, kiem tra bot co rut ra dung
 * ket luan khong. Khong dung database - chi so lieu dung san.
 */
import Decimal from 'decimal.js'
import type { Snapshot } from '../src/lib/metrics'
import { evaluate } from '../src/lib/rules'

let pass = 0
let fail = 0

const D = (n: number) => new Decimal(n)

/** Tinh huong nen: nguoi co tai chinh lanh manh */
function baseline(over: Partial<Snapshot> = {}): Snapshot {
  return {
    periodLabel: 'Tháng thử',
    daysElapsed: 15,
    daysInPeriod: 30,
    income: D(30_000_000),
    incomeBasis: D(30_000_000),
    incomeIsDeclared: true,
    expense: D(11_000_000),
    essential: D(8_000_000),
    flexible: D(3_000_000),
    saving: D(0),
    savingsRate: D(63),
    liquidAssets: D(40_000_000),
    totalDebt: D(0),
    worstDebtRate: null,
    emergencyMonths: D(5),
    monthlyEssentialAvg: D(8_000_000),
    byCategory: [
      { name: 'Nhà ở', icon: '🏠', kind: 'essential', total: D(5_000_000) },
      { name: 'Ăn uống thiết yếu', icon: '🍚', kind: 'essential', total: D(3_000_000) },
      { name: 'Ăn ngoài & cà phê', icon: '☕', kind: 'flexible', total: D(3_000_000) },
    ],
    previous: null,
    hasEmergencyGoal: false,
    ...over,
  }
}

function expectCodes(label: string, s: Snapshot, want: string[], notWant: string[] = []) {
  const codes = evaluate(s).map((i) => i.code)
  const missing = want.filter((c) => !codes.includes(c))
  const unexpected = notWant.filter((c) => codes.includes(c))

  if (!missing.length && !unexpected.length) {
    pass++
    console.log(`  ok    ${label}`)
    return
  }
  fail++
  console.log(`  FAIL  ${label}`)
  if (missing.length) console.log(`          thiếu: ${missing.join(', ')}`)
  if (unexpected.length) console.log(`          thừa:  ${unexpected.join(', ')}`)
  console.log(`          thực tế: ${codes.join(', ') || '(không có)'}`)
}

console.log('\n── Tỷ lệ tiết kiệm ──')
expectCodes('tiêu vượt thu nhập → cảnh báo đỏ',
  baseline({ savingsRate: D(-12), essential: D(20_000_000), flexible: D(14_000_000) }),
  ['savings_rate_negative'])

expectCodes('tiết kiệm 5% → cảnh báo',
  baseline({ savingsRate: D(5) }), ['savings_rate_low'])

expectCodes('tiết kiệm 15% → lưu ý',
  baseline({ savingsRate: D(15) }), ['savings_rate_fair'])

expectCodes('tiết kiệm 63% → tốt, không cảnh báo',
  baseline(), ['savings_rate_good'], ['savings_rate_low', 'savings_rate_negative'])

console.log('\n── Quỹ khẩn cấp ──')
expectCodes('dưới 1 tháng → đỏ',
  baseline({ emergencyMonths: D(0.6), liquidAssets: D(5_000_000) }), ['ef_below_1m'])

expectCodes('2 tháng → chưa an toàn',
  baseline({ emergencyMonths: D(2), liquidAssets: D(16_000_000) }), ['ef_below_min'])

expectCodes('5 tháng → đạt',
  baseline(), ['ef_ok'])

expectCodes('9 tháng → dư, gợi ý sinh lời',
  baseline({ emergencyMonths: D(9), liquidAssets: D(72_000_000) }), ['ef_strong'])

console.log('\n── Nợ lãi cao ──')
expectCodes('nợ 24%/năm → ưu tiên trả',
  baseline({ totalDebt: D(50_000_000), worstDebtRate: D(24) }), ['debt_high_rate'])

expectCodes('nợ 6%/năm → không cảnh báo',
  baseline({ totalDebt: D(50_000_000), worstDebtRate: D(6) }), [], ['debt_high_rate'])

console.log('\n── Chưa khai báo thu nhập ──')
expectCodes('không có thu nhập → nhắc khai báo',
  baseline({ incomeBasis: D(0), income: D(0), incomeIsDeclared: false, savingsRate: null }),
  ['no_income_basis'])

console.log('\n── Chi linh hoạt quá cao ──')
expectCodes('linh hoạt 60% chi tiêu → lưu ý',
  baseline({ essential: D(4_000_000), flexible: D(6_000_000), expense: D(10_000_000) }),
  ['flexible_ratio_high'])

console.log('\n── Tăng vọt so với tháng trước ──')
expectCodes('ăn ngoài tăng 200% → cảnh báo',
  baseline({
    byCategory: [
      { name: 'Ăn ngoài & cà phê', icon: '☕', kind: 'flexible', total: D(6_000_000) },
    ],
    previous: {
      expense: D(2_000_000),
      byCategory: [
        { name: 'Ăn ngoài & cà phê', icon: '☕', kind: 'flexible', total: D(2_000_000) },
      ],
    },
  }),
  ['category_spike'])

expectCodes('tăng 100k → quá nhỏ, không làm phiền',
  baseline({
    byCategory: [
      { name: 'Ăn ngoài & cà phê', icon: '☕', kind: 'flexible', total: D(600_000) },
    ],
    previous: {
      expense: D(500_000),
      byCategory: [
        { name: 'Ăn ngoài & cà phê', icon: '☕', kind: 'flexible', total: D(500_000) },
      ],
    },
  }),
  [], ['category_spike'])

console.log('\n── Nhịp chi tiêu ──')
expectCodes('nửa tháng đã tiêu hết ngân sách → cảnh báo đỏ',
  baseline({ daysElapsed: 15, essential: D(15_000_000), flexible: D(10_000_000) }),
  ['pace_ahead'])

expectCodes('đầu tháng (ngày 2) → chưa đủ dữ liệu, im lặng',
  baseline({ daysElapsed: 2 }), [], ['pace_ahead'])

console.log('\n── Tập trung một danh mục ──')
expectCodes('mua sắm chiếm 50% → lưu ý',
  baseline({
    expense: D(10_000_000),
    byCategory: [
      { name: 'Mua sắm', icon: '🛍️', kind: 'flexible', total: D(5_000_000) },
      { name: 'Nhà ở', icon: '🏠', kind: 'essential', total: D(5_000_000) },
    ],
  }),
  ['concentration_high'])

expectCodes('nhà ở chiếm 50% → bình thường, không cảnh báo',
  baseline({
    expense: D(10_000_000),
    byCategory: [
      { name: 'Nhà ở', icon: '🏠', kind: 'essential', total: D(5_000_000) },
    ],
  }),
  [], ['concentration_high'])

console.log('\n── Thứ tự ưu tiên: cảnh báo nặng lên trước ──')
{
  const insights = evaluate(baseline({
    savingsRate: D(3),
    emergencyMonths: D(0.5),
    liquidAssets: D(4_000_000),
    totalDebt: D(80_000_000),
    worstDebtRate: D(30),
  }))
  const firstSeverity = insights[0]?.severity
  if (firstSeverity === 3) {
    pass++
    console.log('  ok    nhận định đầu tiên là cảnh báo đỏ')
  } else {
    fail++
    console.log(`  FAIL  nhận định đầu tiên có mức ${firstSeverity}, mong đợi 3`)
  }
  const severities = insights.map((i) => i.severity)
  const sorted = [...severities].sort((a, b) => b - a)
  if (JSON.stringify(severities) === JSON.stringify(sorted)) {
    pass++
    console.log('  ok    toàn bộ danh sách xếp từ nặng tới nhẹ')
  } else {
    fail++
    console.log(`  FAIL  thứ tự sai: ${severities.join(',')}`)
  }
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`Đạt: ${pass}   Hỏng: ${fail}`)
console.log(`${'─'.repeat(50)}\n`)
process.exit(fail > 0 ? 1 : 0)
