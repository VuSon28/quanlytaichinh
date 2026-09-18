import Decimal from 'decimal.js'
import type { Snapshot } from './metrics'
import { formatVnd, formatShort } from './money'

/**
 * Bo luat tai chinh.
 *
 * Moi nhan dinh trong file nay deu la mot ham thuan tuy: nhan so lieu da
 * tinh, tra ve ket luan. Khong goi mang, khong goi AI, khong ngau nhien.
 * Nghia la cung mot tinh hinh tai chinh se luon cho cung mot loi khuyen
 * - dieu toi thieu ban co quyen doi hoi o mot cong cu tai chinh.
 *
 * Nguong duoc chon theo thuc te Viet Nam va nguyen tac pho quat, khong
 * phai con so tuy tien:
 *
 *  - Ty le tiet kiem 20%: muc thuong duoc coi la lanh manh de vua tich
 *    luy vua song duoc. Duoi 10% la mong manh truoc bien co.
 *  - Quy khan cap 3-6 thang chi THIET YEU: du de mat viec ma khong phai
 *    ban tai san hay vay nong. Tinh tren chi thiet yeu chu khong phai
 *    tong chi, vi khi that nghiep ban se cat het phan linh hoat.
 *  - No lai suat tren 15%/nam: tra no nay sinh loi chac chan hon gan nhu
 *    moi kenh dau tu - nen uu tien truoc ca viec dau tu.
 */

export type Severity = 1 | 2 | 3 // 1 thong tin, 2 luu y, 3 canh bao

export interface Insight {
  code: string
  severity: Severity
  title: string
  body: string
  /** Viec nen lam, viet o dang menh lenh ngan */
  action?: string
}

/* Nguong - gom mot cho de sau nay chinh cho de */
const T = {
  savingsRateGood: 20,
  savingsRateLow: 10,
  emergencyMonthsMin: 3,
  emergencyMonthsGood: 6,
  flexibleRatioHigh: 45,
  concentrationHigh: 35,
  spikePercent: 40,
  /** Chenh lech duoi muc nay thi khong dang nhac, tranh lam phien */
  spikeMinAmount: 200_000,
  debtRateHigh: 15,
  paceTolerance: 10,
} as const

export function evaluate(s: Snapshot): Insight[] {
  const out: Insight[] = []

  for (const rule of RULES) {
    const got = rule(s)
    if (got) out.push(got)
  }

  // Canh bao nang len truoc; cung muc thi giu nguyen thu tu khai bao
  return out.sort((a, b) => b.severity - a.severity)
}

type Rule = (s: Snapshot) => Insight | null

/* ------------------------------------------------------------------ *
 * Cac luat
 * ------------------------------------------------------------------ */

const noIncomeBasis: Rule = (s) => {
  if (s.incomeBasis.gt(0)) return null
  return {
    code: 'no_income_basis',
    severity: 2,
    title: 'Chưa biết thu nhập của bạn',
    body:
      'Thiếu con số này thì không tính được tỷ lệ tiết kiệm hay ngân sách — ' +
      'hai thước đo quan trọng nhất.',
    action: 'Nhắn `/thunhap 25tr` để khai báo thu nhập hàng tháng.',
  }
}

const savingsRate: Rule = (s) => {
  if (!s.savingsRate) return null
  const r = s.savingsRate
  const pct = `${r.toFixed(0)}%`
  const basis = s.incomeIsDeclared ? 'thu nhập khai báo' : 'thu nhập ghi nhận trong tháng'

  if (r.lt(0)) {
    return {
      code: 'savings_rate_negative',
      severity: 3,
      title: `Đang tiêu vượt thu nhập (${pct})`,
      body:
        `Chi tiêu tháng này đã vượt ${basis}. Phần chênh phải bù bằng tiền tích luỹ ` +
        'hoặc bằng nợ — cả hai đều làm tình hình xấu đi nếu lặp lại.',
      action: 'Xem `/thang` tìm 2 danh mục lớn nhất và cắt ngay trong tuần này.',
    }
  }
  if (r.lt(T.savingsRateLow)) {
    return {
      code: 'savings_rate_low',
      severity: 3,
      title: `Tỷ lệ tiết kiệm quá thấp (${pct})`,
      body:
        `Dưới ${T.savingsRateLow}% nghĩa là gần như toàn bộ thu nhập bị tiêu hết. ` +
        'Một sự cố nhỏ cũng đủ đẩy bạn vào cảnh phải vay.',
      action: `Đặt mục tiêu ${T.savingsRateGood}% — trích ra ngay khi lương về, đừng đợi cuối tháng.`,
    }
  }
  if (r.lt(T.savingsRateGood)) {
    return {
      code: 'savings_rate_fair',
      severity: 2,
      title: `Tỷ lệ tiết kiệm ${pct} — tạm được nhưng chưa đủ`,
      body: `Mốc lành mạnh là ${T.savingsRateGood}%. Bạn còn cách khoảng ${new Decimal(T.savingsRateGood).minus(r).toFixed(0)} điểm phần trăm.`,
      action: 'Tìm một khoản chi linh hoạt lặp lại hàng tháng để cắt.',
    }
  }
  return {
    code: 'savings_rate_good',
    severity: 1,
    title: `Tỷ lệ tiết kiệm ${pct} — tốt`,
    body: `Bạn đang giữ được trên mốc ${T.savingsRateGood}%. Giữ nhịp này.`,
  }
}

const emergencyFund: Rule = (s) => {
  if (!s.emergencyMonths || !s.monthlyEssentialAvg) return null
  const m = s.emergencyMonths
  const need = s.monthlyEssentialAvg.mul(T.emergencyMonthsMin)
  const gap = need.minus(s.liquidAssets)

  if (m.lt(1)) {
    return {
      code: 'ef_below_1m',
      severity: 3,
      title: `Quỹ khẩn cấp chỉ đủ ${m.toFixed(1)} tháng`,
      body:
        `Tiền mặt sẵn có là ${formatVnd(s.liquidAssets)}, trong khi chi thiết yếu ` +
        `mỗi tháng khoảng ${formatVnd(s.monthlyEssentialAvg)}. Mất thu nhập là lập tức gặp khó.`,
      action: `Ưu tiên số một: gom đủ ${formatShort(need)} (${T.emergencyMonthsMin} tháng). Còn thiếu ${formatShort(gap)}.`,
    }
  }
  if (m.lt(T.emergencyMonthsMin)) {
    return {
      code: 'ef_below_min',
      severity: 2,
      title: `Quỹ khẩn cấp đủ ${m.toFixed(1)} tháng — chưa tới mức an toàn`,
      body: `Mốc tối thiểu là ${T.emergencyMonthsMin} tháng chi thiết yếu, tức ${formatVnd(need)}.`,
      action: `Còn thiếu ${formatShort(gap)}. Đây nên là đích đến trước khi nghĩ tới đầu tư.`,
    }
  }
  if (m.lt(T.emergencyMonthsGood)) {
    return {
      code: 'ef_ok',
      severity: 1,
      title: `Quỹ khẩn cấp đủ ${m.toFixed(1)} tháng — đạt mức an toàn`,
      body: `Bạn đã qua mốc ${T.emergencyMonthsMin} tháng. Từ đây có thể bắt đầu tính chuyện tích sản.`,
    }
  }
  return {
    code: 'ef_strong',
    severity: 1,
    title: `Quỹ khẩn cấp đủ ${m.toFixed(1)} tháng — rất vững`,
    body:
      `Trên ${T.emergencyMonthsGood} tháng là dư an toàn. Phần vượt ra đang nằm im ` +
      'và mất giá dần vì lạm phát.',
    action: 'Cân nhắc chuyển phần dư sang kênh sinh lời.',
  }
}

const highInterestDebt: Rule = (s) => {
  if (!s.worstDebtRate || s.totalDebt.isZero()) return null
  if (s.worstDebtRate.lt(T.debtRateHigh)) return null
  return {
    code: 'debt_high_rate',
    severity: 3,
    title: `Đang có nợ lãi suất ${s.worstDebtRate.toFixed(1)}%/năm`,
    body:
      `Tổng dư nợ ${formatVnd(s.totalDebt)}. Trả khoản nợ này mang lại lợi ích chắc chắn ` +
      `${s.worstDebtRate.toFixed(1)}%/năm — cao hơn và an toàn hơn gần như mọi kênh đầu tư.`,
    action: 'Dồn tiền dư trả khoản lãi cao nhất trước, chỉ trả tối thiểu các khoản còn lại.',
  }
}

const flexibleRatio: Rule = (s) => {
  if (s.expense.isZero()) return null
  const spend = s.essential.plus(s.flexible)
  if (spend.isZero()) return null
  const ratio = s.flexible.div(spend).mul(100)
  if (ratio.lt(T.flexibleRatioHigh)) return null
  return {
    code: 'flexible_ratio_high',
    severity: 2,
    title: `Chi linh hoạt chiếm ${ratio.toFixed(0)}% chi tiêu`,
    body:
      `${formatVnd(s.flexible)} đang nằm ở nhóm cắt được (ăn ngoài, mua sắm, giải trí…). ` +
      'Tin tốt: đây cũng là dư địa lớn nhất nếu bạn muốn tăng tiết kiệm mà không phải hy sinh nhu cầu thiết yếu.',
    action: 'Chọn một danh mục linh hoạt và đặt ngân sách cho nó tháng sau.',
  }
}

const concentration: Rule = (s) => {
  if (s.expense.isZero() || !s.byCategory.length) return null
  const top = s.byCategory[0]
  const ratio = top.total.div(s.expense).mul(100)
  if (ratio.lt(T.concentrationHigh)) return null
  if (top.kind === 'essential') return null // Nha o chiem nhieu la binh thuong
  return {
    code: 'concentration_high',
    severity: 2,
    title: `${top.icon ?? ''} ${top.name} chiếm ${ratio.toFixed(0)} % chi tiêu`,
    body: `Một danh mục linh hoạt chiếm hơn ${T.concentrationHigh}% là dấu hiệu mất cân đối.`,
    action: `Nhìn lại ${top.name.toLowerCase()} — ${formatVnd(top.total)} trong tháng này.`,
  }
}

const categorySpike: Rule = (s) => {
  if (!s.previous) return null

  const prevMap = new Map(s.previous.byCategory.map((c) => [c.name, c.total]))
  let worst: { name: string; icon: string | null; diff: Decimal; pct: Decimal } | null = null

  for (const c of s.byCategory) {
    const prev = prevMap.get(c.name)
    if (!prev || prev.isZero()) continue
    const diff = c.total.minus(prev)
    if (diff.lt(T.spikeMinAmount)) continue
    const pct = diff.div(prev).mul(100)
    if (pct.lt(T.spikePercent)) continue
    if (!worst || diff.gt(worst.diff)) {
      worst = { name: c.name, icon: c.icon, diff, pct }
    }
  }

  if (!worst) return null
  return {
    code: 'category_spike',
    severity: 2,
    title: `${worst.icon ?? ''} ${worst.name} tăng ${worst.pct.toFixed(0)}% so với tháng trước`,
    body: `Tăng thêm ${formatVnd(worst.diff)}. Nếu là khoản một lần thì không sao, nhưng nếu lặp lại thì nên xem kỹ.`,
    action: 'Kiểm tra xem đây là chi bất thường hay thói quen mới đang hình thành.',
  }
}

const spendingPace: Rule = (s) => {
  if (!s.incomeBasis.gt(0) || s.daysElapsed < 5) return null
  const spend = s.essential.plus(s.flexible)
  if (spend.isZero()) return null

  const timeGone = new Decimal(s.daysElapsed).div(s.daysInPeriod).mul(100)
  // Ngan sach ngam: phan thu nhap khong danh cho tiet kiem muc tieu
  const budget = s.incomeBasis.mul(100 - T.savingsRateGood).div(100)
  if (budget.lte(0)) return null
  const spent = spend.div(budget).mul(100)

  if (spent.minus(timeGone).lt(T.paceTolerance)) return null

  const projected = spend.div(s.daysElapsed).mul(s.daysInPeriod)
  return {
    code: 'pace_ahead',
    severity: spent.gt(100) ? 3 : 2,
    title: `Tiêu nhanh hơn nhịp tháng (${spent.toFixed(0)}% ngân sách / ${timeGone.toFixed(0)}% số ngày)`,
    body:
      `Giữ nhịp này, hết tháng bạn sẽ tiêu khoảng ${formatVnd(projected)}, ` +
      `trong khi mức hợp lý để giữ tiết kiệm ${T.savingsRateGood}% là ${formatVnd(budget)}.`,
    action: `Còn ${s.daysInPeriod - s.daysElapsed} ngày. Giới hạn chi linh hoạt để kéo lại.`,
  }
}

const RULES: Rule[] = [
  noIncomeBasis,
  savingsRate,
  emergencyFund,
  highInterestDebt,
  spendingPace,
  categorySpike,
  flexibleRatio,
  concentration,
]

/* ------------------------------------------------------------------ *
 * Ket xuat ra tin nhan Telegram
 * ------------------------------------------------------------------ */

const ICON: Record<Severity, string> = { 3: '🔴', 2: '🟡', 1: '🟢' }

export function renderAssessment(s: Snapshot, insights: Insight[]): string {
  const lines: string[] = [`*Đánh giá tài chính — ${s.periodLabel}*`, '']

  lines.push('*Số liệu*')
  if (s.incomeBasis.gt(0)) {
    const tag = s.incomeIsDeclared ? '' : ' _(ghi nhận trong tháng)_'
    lines.push(`Thu nhập: ${formatVnd(s.incomeBasis)}${tag}`)
  }
  lines.push(`Chi tiêu: ${formatVnd(s.essential.plus(s.flexible))}`)
  lines.push(`  • thiết yếu ${formatShort(s.essential)}  • linh hoạt ${formatShort(s.flexible)}`)
  if (!s.saving.isZero()) lines.push(`Tiết kiệm & đầu tư: ${formatVnd(s.saving)}`)
  if (s.savingsRate) lines.push(`Tỷ lệ tiết kiệm: *${s.savingsRate.toFixed(0)}%*`)
  if (s.emergencyMonths) lines.push(`Quỹ khẩn cấp: *${s.emergencyMonths.toFixed(1)} tháng*`)

  if (!insights.length) {
    lines.push('', '_Chưa đủ dữ liệu để đưa ra nhận định. Ghi chép thêm vài ngày nữa._')
    return lines.join('\n')
  }

  lines.push('', '*Nhận định*')
  for (const i of insights) {
    lines.push('', `${ICON[i.severity]} *${i.title}*`)
    lines.push(i.body)
    if (i.action) lines.push(`→ ${i.action}`)
  }

  return lines.join('\n')
}
