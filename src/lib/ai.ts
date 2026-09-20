import Anthropic from '@anthropic-ai/sdk'
import Decimal from 'decimal.js'
import { formatVnd } from './money'
import { buildSnapshot } from './metrics'
import { evaluate } from './rules'
import { buildNetWorth } from './assets'
import { listBudgets, setBudget, findCategoryLoose } from './budget'
import {
  startOfDay, startOfMonth, addDays, addMonths, monthLabel, shortDate,
} from './time'
import {
  findCategoryByName, listCategories, getDefaultAccount, recordTransaction,
  deleteTransaction, listRecent, totalsBetween, setMonthlyIncome,
  setAccountBalance,
} from './ledger'
import { loadHistory, remember, pruneOldChat, type ChatTurn } from './chat'

/**
 * Lop tro chuyen.
 *
 * Bo doc giao dich bang luat (parser.ts) van la cua chinh: "cafe 45k"
 * duoc ghi trong vai mili giay, khong ton mot dong nao. File nay lo
 * phan con lai - nhung cau khong phai giao dich: hoi han, ke le, xin
 * loi khuyen, hay chi la than mot cau cho co nguoi nghe.
 *
 * Nguyen tac quan trong nhat o day: AI KHONG duoc tu bia con so. Moi
 * con so trong cau tra loi phai di ra tu mot cong cu ben duoi, tuc la
 * di ra tu so sach that. Mot nguoi ban noi sai so du cua ban thi te
 * hon nhieu so voi mot nguoi ban khong noi gi.
 */

/**
 * Opus la mac dinh. Doi sang model re hon bang bien moi truong neu ban
 * nhan tin rat nhieu - do la quyet dinh cua ban, khong phai cua code.
 */
const MODEL = process.env.FINBOT_AI_MODEL || 'claude-opus-5'

/**
 * Tro chuyen qua Telegram thi nguoi ta doi cau tra loi trong vai giay.
 * Muc 'low' cho do tre thap ma van thua suc cho viec o day: doc so
 * lieu, dat cau hoi dung, tra loi tu te.
 */
const EFFORT = (process.env.FINBOT_AI_EFFORT || 'low') as 'low' | 'medium' | 'high'

/**
 * Khong phai model nao cung nhan tham so 'effort'. Dong Haiku tu choi
 * thang - goi kem la loi 400 chu khong phai lo di, nen phai bo han ra
 * thay vi cu gui cho chac.
 */
const SUPPORTS_EFFORT = !/haiku/i.test(MODEL)

/** Chan vong lap chay mai neu model cu goi cong cu khong dung */
const MAX_TOOL_ROUNDS = 8

/* ------------------------------------------------------------------ *
 * Tim kiem web
 *
 * Gia vang, ty gia, gia co phieu - nhung con so nam ngoai so sach cua
 * ban. Khong co cong cu nay thi bot chi biet noi "minh chiu", va no da
 * noi dung: tu bia ra mot con so gia vang con te hon nhieu.
 *
 * Nhung tim kiem DAT hon han mot cau tro chuyen thuong. Vi vay co hai
 * cai phanh: gioi han so lan moi cau, va mot lenh tat han bang bien moi
 * truong khi ban thay hoa don tang.
 * ------------------------------------------------------------------ */

const WEB_SEARCH_ON = process.env.FINBOT_WEB_SEARCH !== 'off'

/** Toi da bao nhieu lan tim cho MOT cau hoi */
const WEB_SEARCH_MAX_USES = Number(process.env.FINBOT_WEB_SEARCH_MAX || 2)

/**
 * Ban moi cua cong cu tim kiem chi chay tren dong Opus/Sonnet doi gan
 * day. Haiku va cac model cu hon phai dung ban co - goi nham ban la
 * loi 404, khong phai lo di.
 */
const MODERN_SEARCH = /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable)/.test(MODEL)

const WEB_SEARCH_TOOL = {
  type: MODERN_SEARCH ? 'web_search_20260209' : 'web_search_20250305',
  name: 'web_search',
  max_uses: WEB_SEARCH_MAX_USES,
} as const

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/* ------------------------------------------------------------------ *
 * Dinh tuyen: cau nay danh cho parser hay cho AI?
 *
 * Quan trong hon ve ngoai. "500 trieu" trong cau "co nen mua xe 500
 * trieu khong?" ma di nham vao parser thi ban vua bi ghi mot khoan chi
 * 500 trieu - mot loi buc minh hon nhieu so voi viec tra loi cham.
 * ------------------------------------------------------------------ */

const QUESTION_MARKERS = [
  'co nen', 'nen khong', 'the nao', 'lam sao', 'tai sao', 'vi sao',
  'bao nhieu', 'con bao', 'giup toi', 'giup minh', 'tu van', 'y kien',
  'nghi gi', 'thay sao', 'danh gia', 'so voi', 'con du', 'du khong',
  'giai thich', 'nghia la', 'ke hoach', 'muc tieu', 'tiet kiem duoc',
  'chao ban', 'cam on', 'minh dang', 'toi dang', 'co phai',
]

function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd').replace(/\u0110/g, 'D')
    .toLowerCase()
}

/**
 * Tra ve true khi cau nay nen di den AI thay vi parser.
 *
 * Nguong 10 tu khong phai con so thieng. No dua tren cach nguoi ta ghi
 * chi tieu that: "an trua 55k", "do xang 80k" - ghi chep thi ngan gon.
 * Viet dai la dang KE CHUYEN, khong phai dang ghi so.
 */
export function looksLikeChat(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[?\uFF1F]/.test(t)) return true

  const flat = deaccent(t)
  if (QUESTION_MARKERS.some((m) => flat.includes(m))) return true

  return t.split(/\s+/).length > 10
}

/* ------------------------------------------------------------------ *
 * Tinh cach
 * ------------------------------------------------------------------ */

function systemPrompt(name: string, tz: string, today: string): string {
  return [
    `Bạn là người bạn thân của ${name}, và tình cờ bạn rất rành chuyện tiền nong. ` +
    `Bạn đang nhắn tin với ${name} qua Telegram.`,
    '',
    'CÁCH NÓI CHUYỆN',
    '- Xưng "mình", gọi người kia là "bạn". Nói tiếng Việt đời thường, như nhắn tin cho bạn bè thật.',
    '- Ngắn. Hai ba câu là đủ cho phần lớn tình huống. Đây là khung chat, không phải bài báo cáo.',
    `- Không lên lớp, không giảng đạo đức. ${name} biết cà phê 50k là đắt rồi, không cần bạn nhắc.`,
    `- Khi ${name} tiêu nhiều, hỏi trước khi kết luận. Có thể có lý do bạn chưa biết.`,
    `- Khi ${name} làm tốt, nói ra. Người ta bỏ thói quen ghi chép vì thấy nó chỉ toàn trách móc.`,
    '- Được phép đùa, được phép nói thẳng. Đừng nói như nhân viên ngân hàng đang đọc kịch bản.',
    `- Nếu ${name} chỉ muốn than thở, cứ nghe. Không phải câu nào cũng cần một lời khuyên tài chính.`,
    '',
    'QUY TẮC KHÔNG ĐƯỢC PHÁ',
    '- Không bao giờ tự nghĩ ra con số. Mọi số tiền bạn nói ra phải lấy từ công cụ. Chưa gọi công cụ thì chưa biết.',
    '- Không có dữ liệu thì nói thẳng là chưa có, và chỉ cách khai báo. Đừng đoán.',
    `- Khi ${name} kể một khoản ĐÃ tiêu (ví dụ "trưa nay ăn hết 80k"), ghi luôn bằng công cụ rồi báo lại.`,
    `- Khi ${name} mới chỉ NHẮC đến một con số chứ chưa tiêu (ví dụ "có nên mua xe 500 triệu không"), ` +
    'tuyệt đối không ghi vào sổ.',
    '- Không chắc thì hỏi lại một câu, đừng ghi bừa rồi sửa sau.',
    ...(WEB_SEARCH_ON ? [
      '',
      'TRA CỨU GIÁ THỊ TRƯỜNG',
      '- Bạn tra web được: giá vàng SJC/DOJI, tỷ giá ngoại tệ, giá cổ phiếu, lãi suất ngân hàng.',
      '- Chỉ tra khi người dùng thật sự hỏi một con số ngoài thị trường. ' +
      'Chuyện trong sổ (đã tiêu bao nhiêu, còn bao nhiêu) thì dùng công cụ đọc sổ, đừng tra web.',
      '- Tra xong nói rõ nguồn và thời điểm, ví dụ "SJC sáng nay". Giá vàng đổi từng giờ, ' +
      'một con số không kèm mốc thời gian là vô dụng.',
      '- Trong một câu trả lời, tra một lần là đủ — đừng tìm đi tìm lại cho chắc.',
      '- NHƯNG tuyệt đối không lấy lại giá cũ trong đoạn chat phía trên để trả lời câu mới. ' +
      'Giá thị trường hết hạn ngay khi vừa nói xong. Hỏi lại là phải tra lại.',
      '- Nếu kết quả tìm được không rõ ngày, hoặc các nguồn lệch nhau, nói thẳng là không chốt ' +
      'được và bảo người dùng xem trang SJC. Đưa một con số mình không chắc còn tệ hơn không đưa.',
    ] : []),
    '',
    'ĐỊNH DẠNG',
    '- Telegram chỉ hiểu *đậm* và _nghiêng_. Đừng dùng tiêu đề markdown, bảng, hay khối code.',
    '- Tiền viết kiểu Việt: 45.000 đ, 3,5tr, 20 triệu.',
    '- Dùng emoji thưa thôi, một hai cái khi thật hợp.',
    '',
    'BỐI CẢNH',
    `- Hôm nay là ${today} (múi giờ ${tz}).`,
    '- Đơn vị tiền tệ: VND.',
  ].join('\n')
}

/* ------------------------------------------------------------------ *
 * Cong cu
 *
 * Moi cong cu la mot cua so nho nhin vao so sach that. Model khong doc
 * thang database - no chi hoi duoc qua may cai cua so nay. Do la co y:
 * cai gi khong co cong cu thi model khong lam duoc, ke ca khi no muon.
 * ------------------------------------------------------------------ */

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'ghi_giao_dich',
    description:
      'Ghi một khoản thu hoặc chi vào sổ. Chỉ dùng khi người dùng nói về khoản tiền ĐÃ tiêu ' +
      'hoặc ĐÃ nhận. Không dùng cho khoản đang cân nhắc, đang hỏi giá, hay chỉ nhắc đến.',
    input_schema: {
      type: 'object',
      properties: {
        so_tien: { type: 'number', description: 'Số tiền VND, luôn dương. Ví dụ 45000' },
        loai: { type: 'string', enum: ['chi', 'thu'] },
        danh_muc: {
          type: 'string',
          description: 'Tên danh mục, ví dụ "Ăn ngoài", "Đi lại". Bỏ trống nếu không chắc.',
        },
        ghi_chu: { type: 'string', description: 'Mô tả ngắn, ví dụ "cà phê với Lan"' },
      },
      required: ['so_tien', 'loai'],
    },
  },
  {
    name: 'xem_tong_ket',
    description: 'Xem tổng thu chi của một khoảng thời gian, kèm chi tiết từng danh mục.',
    input_schema: {
      type: 'object',
      properties: {
        ky: {
          type: 'string',
          enum: ['hom_nay', 'hom_qua', 'bay_ngay_qua', 'thang_nay', 'thang_truoc'],
        },
      },
      required: ['ky'],
    },
  },
  {
    name: 'xem_giao_dich_gan_day',
    description: 'Danh sách giao dịch gần nhất, kèm mã giao dịch để xoá nếu cần.',
    input_schema: {
      type: 'object',
      properties: { so_luong: { type: 'number', description: 'Mặc định 10, tối đa 30' } },
    },
  },
  {
    name: 'xem_tinh_hinh',
    description:
      'Bức tranh tài chính tổng thể tháng này: thu nhập, chi tiêu, tỷ lệ tiết kiệm, quỹ khẩn ' +
      'cấp, nợ, và các nhận định đã tính sẵn. Dùng khi người dùng hỏi "tình hình thế nào", ' +
      '"tôi tiêu có nhiều không", hay xin lời khuyên.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'xem_ngan_sach',
    description: 'Hạn mức từng danh mục tháng này và đã dùng bao nhiêu phần trăm.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'dat_ngan_sach',
    description: 'Đặt hạn mức chi tiêu tháng này cho một danh mục.',
    input_schema: {
      type: 'object',
      properties: {
        danh_muc: { type: 'string' },
        so_tien: { type: 'number', description: 'Hạn mức VND' },
      },
      required: ['danh_muc', 'so_tien'],
    },
  },
  {
    name: 'xem_tai_san_rong',
    description: 'Tài sản, nợ và giá trị tài sản ròng hiện tại.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'xoa_giao_dich',
    description: 'Xoá một giao dịch theo mã. Lấy mã từ xem_giao_dich_gan_day.',
    input_schema: {
      type: 'object',
      properties: { ma_giao_dich: { type: 'number' } },
      required: ['ma_giao_dich'],
    },
  },
  {
    name: 'khai_bao',
    description:
      'Lưu thu nhập hàng tháng hoặc số dư hiện có. Hai con số này là nền để tính tỷ lệ tiết ' +
      'kiệm và quỹ khẩn cấp — thiếu chúng thì mọi đánh giá đều vô nghĩa.',
    input_schema: {
      type: 'object',
      properties: {
        thu_nhap_thang: { type: 'number' },
        so_du: { type: 'number' },
      },
    },
  },
]

/* ------------------------------------------------------------------ *
 * Thuc thi cong cu
 * ------------------------------------------------------------------ */

export interface AiUser {
  id: number
  displayName: string | null
  timezone: string
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  u: AiUser,
): Promise<string> {
  const now = new Date()
  const tz = u.timezone

  switch (name) {
    case 'ghi_giao_dich': {
      const amount = new Decimal(Number(input.so_tien) || 0)
      if (amount.lte(0)) return 'Lỗi: số tiền phải lớn hơn 0.'

      const type = input.loai === 'thu' ? 'income' as const : 'expense' as const
      const note = String(input.ghi_chu ?? '').trim()

      let categoryId: number | null = null
      let categoryLabel = 'Chưa phân loại'
      if (input.danh_muc) {
        const q = String(input.danh_muc)
        const cat = await findCategoryLoose(u.id, q) ?? await findCategoryByName(u.id, q)
        if (cat) {
          categoryId = cat.id
          categoryLabel = cat.name
        }
      }

      const account = await getDefaultAccount(u.id)
      const tx = await recordTransaction({
        userId: u.id,
        parsed: {
          type,
          amount,
          note,
          categoryName: categoryId ? categoryLabel : null,
          matchedKeyword: null,
          confidence: 'none',
        },
        categoryId,
        accountId: account?.id ?? null,
        source: 'text',
        rawInput: note || `${type} ${amount.toFixed(0)}`,
      })

      return `Đã ghi mã #${tx.id}: ${type === 'income' ? 'thu' : 'chi'} ` +
        `${formatVnd(amount)}, danh mục ${categoryLabel}` +
        `${note ? `, ghi chú "${note}"` : ''}.` +
        (categoryId === null
          ? ' Lưu ý: chưa xếp được vào danh mục nào — nên hỏi người dùng muốn xếp vào đâu.'
          : '')
    }

    case 'xem_tong_ket': {
      const ky = String(input.ky)
      let from: Date
      let to: Date
      let label: string

      if (ky === 'hom_nay') {
        from = startOfDay(now, tz)
        to = addDays(from, 1, tz)
        label = 'Hôm nay'
      } else if (ky === 'hom_qua') {
        to = startOfDay(now, tz)
        from = addDays(to, -1, tz)
        label = 'Hôm qua'
      } else if (ky === 'bay_ngay_qua') {
        to = addDays(startOfDay(now, tz), 1, tz)
        from = addDays(to, -7, tz)
        label = '7 ngày qua'
      } else if (ky === 'thang_truoc') {
        from = addMonths(startOfMonth(now, tz), -1, tz)
        to = startOfMonth(now, tz)
        label = monthLabel(from, tz)
      } else {
        from = startOfMonth(now, tz)
        to = addMonths(now, 1, tz)
        label = monthLabel(now, tz)
      }

      const t = await totalsBetween(u.id, from, to)
      if (t.expense.isZero() && t.income.isZero()) {
        return `${label}: chưa có giao dịch nào được ghi.`
      }

      const lines = t.byCategory.slice(0, 12).map((c) => `  ${c.name}: ${formatVnd(c.total)}`)

      return [
        label,
        `Tổng chi: ${formatVnd(t.expense)}`,
        `Tổng thu: ${formatVnd(t.income)}`,
        lines.length ? `Theo danh mục:\n${lines.join('\n')}` : '',
      ].filter(Boolean).join('\n')
    }

    case 'xem_giao_dich_gan_day': {
      const limit = Math.min(Math.max(Number(input.so_luong) || 10, 1), 30)
      const rows = await listRecent(u.id, limit)
      if (!rows.length) return 'Sổ còn trống, chưa có giao dịch nào.'

      return rows.map((r) =>
        `#${r.id} ${shortDate(r.occurredAt, tz)} ` +
        `${r.type === 'income' ? '+' : '-'}${formatVnd(r.amount)} ` +
        `${r.categoryName ?? 'Chưa phân loại'}${r.note ? ` (${r.note})` : ''}`,
      ).join('\n')
    }

    case 'xem_tinh_hinh': {
      const s = await buildSnapshot(u.id, now, tz)
      const insights = evaluate(s)

      const parts = [
        `Kỳ: ${s.periodLabel} (đã qua ${s.daysElapsed}/${s.daysInPeriod} ngày)`,
        `Thu thực nhận trong kỳ: ${formatVnd(s.income)}`,
        s.incomeIsDeclared
          ? `Thu nhập tháng đã khai: ${formatVnd(s.incomeBasis)}`
          : 'Thu nhập tháng: CHƯA KHAI BÁO',
        `Tổng chi: ${formatVnd(s.expense)}`,
        `  thiết yếu ${formatVnd(s.essential)}, linh hoạt ${formatVnd(s.flexible)}, ` +
        `tiết kiệm/đầu tư ${formatVnd(s.saving)}`,
        s.savingsRate
          ? `Tỷ lệ tiết kiệm: ${s.savingsRate.toFixed(0)}%`
          : 'Tỷ lệ tiết kiệm: chưa tính được',
        s.balanceDeclared
          ? `Tiền mặt + ngân hàng: ${formatVnd(s.liquidAssets)}`
          : 'Số dư: CHƯA KHAI BÁO — mọi phép tính về quỹ khẩn cấp đều vô nghĩa',
        s.emergencyMonths
          ? `Quỹ khẩn cấp: đủ sống ${s.emergencyMonths.toFixed(1)} tháng`
          : 'Quỹ khẩn cấp: chưa tính được',
        s.totalDebt.gt(0)
          ? `Tổng nợ: ${formatVnd(s.totalDebt)}` +
            (s.worstDebtRate ? `, lãi cao nhất ${s.worstDebtRate.toFixed(1)}%/năm` : '')
          : 'Nợ: không có',
      ]

      if (s.byCategory.length) {
        parts.push('Chi nhiều nhất:')
        for (const c of s.byCategory.slice(0, 6)) {
          parts.push(`  ${c.name}: ${formatVnd(c.total)}`)
        }
      }
      if (s.previous) {
        parts.push(`Cùng kỳ tháng trước chi: ${formatVnd(s.previous.expense)}`)
      }
      if (insights.length) {
        parts.push('Nhận định đã tính sẵn (dùng làm gợi ý, diễn đạt lại bằng lời của bạn):')
        for (const i of insights) parts.push(`  ${i.body}`)
      }

      return parts.join('\n')
    }

    case 'xem_ngan_sach': {
      const rows = await listBudgets(u.id, now, tz)
      if (!rows.length) return 'Chưa đặt hạn mức cho danh mục nào.'
      return rows.map((b) =>
        `${b.categoryName}: đã dùng ${formatVnd(b.spent)}/${formatVnd(b.amount)} ` +
        `(${b.used.toFixed(0)}%), còn ${formatVnd(b.remaining)}`,
      ).join('\n')
    }

    case 'dat_ngan_sach': {
      const q = String(input.danh_muc ?? '')
      const cat = await findCategoryLoose(u.id, q)
      if (!cat) {
        const all = await listCategories(u.id, false)
        return `Không tìm thấy danh mục "${q}". ` +
          `Các danh mục đang có: ${all.map((c) => c.name).join(', ')}`
      }
      const amount = new Decimal(Number(input.so_tien) || 0)
      if (amount.lte(0)) return 'Lỗi: hạn mức phải lớn hơn 0.'

      await setBudget(u.id, cat.id, amount, now, tz)
      return `Đã đặt hạn mức ${formatVnd(amount)} cho ${cat.name}, áp dụng tháng này.`
    }

    case 'xem_tai_san_rong': {
      const nw = await buildNetWorth(u.id)
      const lines = [
        `Tiền mặt + ngân hàng: ${formatVnd(nw.liquid)}`,
        `Tài sản đầu tư: ${formatVnd(nw.invested)}`,
        `Nợ: ${formatVnd(nw.debt)}`,
        `Tài sản ròng: ${formatVnd(nw.total)}`,
      ]
      if (nw.assets.length) {
        lines.push('Chi tiết tài sản:')
        for (const a of nw.assets) lines.push(`  ${a.name}: ${formatVnd(a.value)}`)
      }
      if (nw.debts.length) {
        lines.push('Chi tiết nợ:')
        for (const d of nw.debts) {
          lines.push(
            `  ${d.name}: còn ${formatVnd(d.outstanding)}, lãi ${d.annualRate.toFixed(1)}%/năm`,
          )
        }
      }
      if (nw.previous) {
        lines.push(`Lần chụp trước (${nw.previous.takenOn}): ${formatVnd(nw.previous.total)}`)
      }
      return lines.join('\n')
    }

    case 'xoa_giao_dich': {
      const id = Number(input.ma_giao_dich)
      const removed = await deleteTransaction(u.id, id)
      return removed
        ? `Đã xoá giao dịch #${id} (${formatVnd(removed.amount)}). Số dư đã hoàn lại.`
        : `Không tìm thấy giao dịch #${id}.`
    }

    case 'khai_bao': {
      const done: string[] = []
      if (input.thu_nhap_thang != null) {
        const v = new Decimal(Number(input.thu_nhap_thang) || 0)
        if (v.gt(0)) {
          await setMonthlyIncome(u.id, v)
          done.push(`thu nhập tháng ${formatVnd(v)}`)
        }
      }
      if (input.so_du != null) {
        const v = new Decimal(Number(input.so_du) || 0)
        if (v.gte(0)) {
          await setAccountBalance(u.id, v)
          done.push(`số dư ${formatVnd(v)}`)
        }
      }
      return done.length ? `Đã lưu ${done.join(' và ')}.` : 'Không có gì để lưu.'
    }

    default:
      return `Lỗi: không có công cụ tên "${name}".`
  }
}

/* ------------------------------------------------------------------ *
 * Vong lap hoi thoai
 * ------------------------------------------------------------------ */

export interface ConverseResult {
  reply: string
  /** So lan doc/ghi so - mien phi, chi ton chut token */
  toolCalls: number
  /**
   * So lan tim kiem web - day moi la thu ton tien that.
   * Dem rieng de ban nhin duoc ngay khi no tang bat thuong.
   */
  webSearches: number
}

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) client = new Anthropic()
  return client
}

export async function converse(u: AiUser, text: string): Promise<ConverseResult> {
  const history = await loadHistory(u.id)
  const name = u.displayName ?? 'bạn'
  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric',
    timeZone: u.timezone,
  })

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t: ChatTurn) => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: text },
  ]

  let toolCalls = 0
  let webSearches = 0
  let reply = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2048,
      ...(SUPPORTS_EFFORT ? { output_config: { effort: EFFORT } } : {}),
      /**
       * Tinh cach va danh sach cong cu khong doi giua cac luot, nen
       * danh dau de Claude dung lai phan da nap - re hon han khi ban
       * nhan tin lien tuc.
       */
      system: [{
        type: 'text',
        text: systemPrompt(name, u.timezone, today),
        cache_control: { type: 'ephemeral' },
      }],
      tools: WEB_SEARCH_ON ? [...TOOLS, WEB_SEARCH_TOOL] : TOOLS,
      messages,
    })

    const said = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      /**
       * Noi bang chuoi rong, KHONG phai ky tu xuong dong.
       *
       * Khi co trich dan nguon, Claude cat mot cau thanh nhieu khoi van
       * ban lien nhau. Noi bang '\n' se dam dau dong vao giua cau:
       * "ty gia mua vao - ban ra la\n24.401 - 26.863 d".
       */
      .join('')
      .trim()
    if (said) reply = said

    // Tim kiem chay ben may chu Anthropic nen khong di qua runTool -
    // phai dem rieng o day, neu khong chi phi that se vo hinh.
    webSearches += response.content.filter(
      (b) => b.type === 'server_tool_use' && b.name === 'web_search',
    ).length

    /**
     * Cong cu tim kiem chay ben phia may chu Anthropic, va khi no can
     * them luot thi tra ve 'pause_turn'. Day khong phai loi - chi la
     * "toi chua xong, goi lai di". Khong xu ly nhanh nay thi cau tra
     * loi bi cat ngang ma khong bao gi ca.
     */
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content })
      continue
    }

    if (response.stop_reason !== 'tool_use') break

    const calls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    if (!calls.length) break

    messages.push({ role: 'assistant', content: response.content })

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) {
      toolCalls++
      let out: string
      try {
        out = await runTool(call.name, call.input as Record<string, unknown>, u)
      } catch (err) {
        console.error(`[ai] cong cu ${call.name} loi:`, err)
        out = 'Lỗi khi đọc sổ. Hãy nói với người dùng là đang trục trặc, đừng đoán số.'
      }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: out })
    }

    messages.push({ role: 'user', content: results })
  }

  if (!reply) {
    reply = 'Mình hơi rối chỗ này. Bạn nhắn lại giúp mình một câu ngắn hơn được không?'
  }

  await remember(u.id, 'user', text)
  await remember(u.id, 'assistant', reply)
  await pruneOldChat(u.id)

  return { reply, toolCalls, webSearches }
}
