import { Bot, InlineKeyboard } from 'grammy'
import Decimal from 'decimal.js'
import { formatVnd, formatShort, parseAmount } from './money'
import { parseTransaction } from './parser'
import { buildSnapshot } from './metrics'
import { evaluate, renderAssessment } from './rules'
import { startOfDay, startOfMonth, addDays, addMonths, monthLabel, shortDate } from './time'
import {
  getOrCreateUser, loadLearnedKeywords, learnKeyword, findCategoryByName,
  listCategories, getDefaultAccount, recordTransaction, deleteTransaction,
  listRecent, totalsBetween, setMonthlyIncome, saveInsights,
} from './ledger'

const OWNER_ID = Number(process.env.OWNER_TELEGRAM_ID || 0)

/**
 * `next build` nap module nay de phan tich route, khi do bien moi truong
 * co the chua co. Constructor cua grammY khong goi mang, chi giu token,
 * nen dung tam mot chuoi thay the la an toan - va ta kiem tra token that
 * o dau moi request thay vi lam hong ca lan build.
 */
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN ?? 'build-time-placeholder')

/* ------------------------------------------------------------------ *
 * Chan nguoi la
 *
 * Bot nay giu toan bo du lieu tai chinh cua mot nguoi. Bat ky ai biet
 * ten bot deu co the nhan tin cho no, nen phai chan ngay o cua.
 * ------------------------------------------------------------------ */

bot.use(async (ctx, next) => {
  const from = ctx.from?.id
  if (!from) return
  if (OWNER_ID && from !== OWNER_ID) {
    await ctx.reply('Bot này dành riêng cho một người dùng. Bạn không có quyền truy cập.')
    return
  }
  await next()
})

/* ------------------------------------------------------------------ *
 * Lenh
 * ------------------------------------------------------------------ */

bot.command('start', async (ctx) => {
  const u = await getOrCreateUser(ctx.from!.id, ctx.from!.first_name)
  await ctx.reply(
    `Chào ${u.displayName ?? 'bạn'} 👋\n\n` +
    'Cứ nhắn cho tôi khoản chi, viết như bình thường:\n' +
    '  • `cafe 45k`\n' +
    '  • `đổ xăng 80k`\n' +
    '  • `ăn trưa 55 nghìn`\n' +
    '  • `+20tr lương` (dấu + là khoản thu)\n\n' +
    'Tôi tự đoán danh mục. Lần nào chưa biết thì hỏi bạn một lần rồi nhớ luôn.\n\n' +
    '*Xem lại*\n' +
    '/homnay — chi tiêu hôm nay\n' +
    '/thang — tổng kết tháng này\n' +
    '/gannhat — 10 giao dịch gần nhất\n' +
    '/xoa — xoá giao dịch vừa ghi\n\n' +
    '*Đánh giá tài chính*\n' +
    '/thunhap `25tr` — khai báo thu nhập tháng\n' +
    '/danhgia — nhận định & lời khuyên\n\n' +
    '_Khai báo thu nhập trước, rồi /danhgia mới tính được tỷ lệ tiết kiệm._',
    { parse_mode: 'Markdown' },
  )
})

bot.command('homnay', async (ctx) => {
  const u = await getOrCreateUser(ctx.from!.id)
  const start = startOfDay(new Date(), u.timezone)
  const end = addDays(start, 1, u.timezone)
  await ctx.reply(await renderPeriod(u.id, start, end, 'Hôm nay'), { parse_mode: 'Markdown' })
})

bot.command('thang', async (ctx) => {
  const u = await getOrCreateUser(ctx.from!.id)
  const now = new Date()
  const start = startOfMonth(now, u.timezone)
  const end = addMonths(now, 1, u.timezone)
  await ctx.reply(
    await renderPeriod(u.id, start, end, monthLabel(now, u.timezone)),
    { parse_mode: 'Markdown' },
  )
})

/* ------------------------------------------------------------------ *
 * Danh gia tai chinh
 * ------------------------------------------------------------------ */

bot.command('danhgia', async (ctx) => {
  const u = await getOrCreateUser(ctx.from!.id)
  const snapshot = await buildSnapshot(u.id, new Date(), u.timezone)
  const insights = evaluate(snapshot)

  await ctx.reply(renderAssessment(snapshot, insights), { parse_mode: 'Markdown' })

  // Ghi lai de lan sau khong lap lai y nguyen loi khuyen cu
  if (insights.length) await saveInsights(u.id, snapshot, insights)
})

bot.command('thunhap', async (ctx) => {
  const u = await getOrCreateUser(ctx.from!.id)
  const arg = ctx.match?.trim()

  if (!arg) {
    const cur = u.monthlyIncome ? formatVnd(u.monthlyIncome) : 'chưa khai báo'
    await ctx.reply(
      `Thu nhập hàng tháng hiện tại: *${cur}*\n\n` +
      'Đặt lại bằng cách nhắn: `/thunhap 25tr`\n\n' +
      '_Con số này là mẫu số để tính tỷ lệ tiết kiệm và ngân sách. ' +
      'Nếu thu nhập thất thường, cứ điền mức trung bình các tháng gần đây._',
      { parse_mode: 'Markdown' },
    )
    return
  }

  const amount = parseAmount(arg)
  if (!amount || amount.lte(0)) {
    await ctx.reply('Không đọc được số tiền. Thử: `/thunhap 25tr`', { parse_mode: 'Markdown' })
    return
  }

  await setMonthlyIncome(u.id, amount)
  await ctx.reply(
    `✅ Đã ghi thu nhập hàng tháng: *${formatVnd(amount)}*\n\n` +
    'Nhắn /danhgia để xem đánh giá tài chính.',
    { parse_mode: 'Markdown' },
  )
})

bot.command('gannhat', async (ctx) => {
  const u = await getOrCreateUser(ctx.from!.id)
  const rows = await listRecent(u.id, 10)
  if (!rows.length) return ctx.reply('Chưa có giao dịch nào.')

  const lines = rows.map((r) => {
    const sign = r.type === 'income' ? '+' : '−'
    const when = shortDate(new Date(r.occurredAt), u.timezone)
    const what = r.note || r.categoryName || 'Không ghi chú'
    return `\`#${r.id}\` ${when}  ${r.categoryIcon ?? '•'} ${what} — ${sign}${formatShort(r.amount)}`
  })
  await ctx.reply(`*10 giao dịch gần nhất*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' })
})

bot.command('xoa', async (ctx) => {
  const u = await getOrCreateUser(ctx.from!.id)
  const arg = ctx.match?.trim()

  let targetId: number
  if (arg) {
    const parsed = Number(arg.replace('#', ''))
    if (!Number.isFinite(parsed)) return ctx.reply('Cú pháp: `/xoa 123`', { parse_mode: 'Markdown' })
    targetId = parsed
  } else {
    const [latest] = await listRecent(u.id, 1)
    if (!latest) return ctx.reply('Chưa có giao dịch nào để xoá.')
    targetId = latest.id
  }

  const deleted = await deleteTransaction(u.id, targetId)
  if (!deleted) return ctx.reply('Không tìm thấy giao dịch đó.')
  await ctx.reply(`🗑 Đã xoá: ${deleted.note || 'giao dịch'} — ${formatVnd(deleted.amount)}`)
})

/* ------------------------------------------------------------------ *
 * Nhap giao dich bang tin nhan tu do
 * ------------------------------------------------------------------ */

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text
  if (text.startsWith('/')) return

  const u = await getOrCreateUser(ctx.from!.id, ctx.from!.first_name)
  const learned = await loadLearnedKeywords(u.id)
  const parsed = parseTransaction(text, learned)

  if (!parsed) {
    await ctx.reply(
      'Tôi không thấy số tiền nào trong tin nhắn.\n' +
      'Thử: `cafe 45k` hoặc `ăn trưa 55 nghìn`',
      { parse_mode: 'Markdown' },
    )
    return
  }

  const account = await getDefaultAccount(u.id)

  // Doan duoc danh muc -> ghi luon, khong lam phien
  if (parsed.categoryName) {
    const cat = await findCategoryByName(u.id, parsed.categoryName)
    if (cat) {
      const tx = await recordTransaction({
        userId: u.id,
        parsed,
        categoryId: cat.id,
        accountId: account?.id ?? null,
        rawInput: text,
      })
      if (parsed.note) await learnKeyword(u.id, parsed.note, cat.id)

      const sign = parsed.type === 'income' ? '+' : '−'
      await ctx.reply(
        `✅ ${cat.icon ?? ''} *${cat.name}*  ${sign}${formatVnd(parsed.amount)}\n` +
        `${parsed.note ? `_${parsed.note}_\n` : ''}` +
        `\`#${tx.id}\` — sai thì /xoa`,
        { parse_mode: 'Markdown' },
      )
      return
    }
  }

  // Khong doan duoc -> hoi mot lan, roi nho vinh vien
  const cats = await listCategories(u.id, parsed.type === 'income')
  const kb = new InlineKeyboard()
  cats.forEach((c, i) => {
    kb.text(`${c.icon ?? ''} ${c.name}`, `pick:${c.id}`)
    if (i % 2 === 1) kb.row()
  })

  await ctx.reply(
    `${formatVnd(parsed.amount)}${parsed.note ? ` — _${parsed.note}_` : ''}\n` +
    'Xếp vào mục nào? (tôi sẽ nhớ cho lần sau)',
    { parse_mode: 'Markdown', reply_markup: kb },
  )
})

/* ------------------------------------------------------------------ *
 * Nguoi dung chon danh muc
 * ------------------------------------------------------------------ */

bot.callbackQuery(/^pick:(\d+)$/, async (ctx) => {
  const categoryId = Number(ctx.match![1])
  const u = await getOrCreateUser(ctx.from.id)

  // Cau goc nam trong tin nhan ma bot da tra loi
  const original = ctx.callbackQuery.message?.reply_to_message
  const raw = (original && 'text' in original ? original.text : null)
    ?? ctx.callbackQuery.message?.text
    ?? ''

  const learned = await loadLearnedKeywords(u.id)
  const parsed = parseTransaction(raw, learned)
  if (!parsed) {
    await ctx.answerCallbackQuery('Không đọc lại được giao dịch, nhắn lại giúp tôi.')
    return
  }

  const account = await getDefaultAccount(u.id)
  const tx = await recordTransaction({
    userId: u.id,
    parsed,
    categoryId,
    accountId: account?.id ?? null,
    rawInput: raw,
  })
  if (parsed.note) await learnKeyword(u.id, parsed.note, categoryId)

  await ctx.answerCallbackQuery('Đã ghi và nhớ')
  await ctx.editMessageText(
    `✅ Đã ghi ${formatVnd(parsed.amount)}${parsed.note ? ` — _${parsed.note}_` : ''}\n` +
    `Lần sau gặp "${parsed.note}" tôi tự xếp đúng mục.\n\`#${tx.id}\``,
    { parse_mode: 'Markdown' },
  )
})

/* ------------------------------------------------------------------ *
 * Bao cao
 * ------------------------------------------------------------------ */

async function renderPeriod(userId: number, from: Date, to: Date, label: string) {
  const t = await totalsBetween(userId, from, to)

  if (t.expense.isZero() && t.income.isZero()) {
    return `*${label}*\n\nChưa có giao dịch nào.`
  }

  const lines: string[] = [`*${label}*`, '']
  lines.push(`Chi: *${formatVnd(t.expense)}*`)
  if (!t.income.isZero()) lines.push(`Thu: *${formatVnd(t.income)}*`)

  if (t.byCategory.length) {
    lines.push('', '*Theo danh mục*')
    for (const c of t.byCategory.slice(0, 10)) {
      const pct = t.expense.isZero()
        ? new Decimal(0)
        : c.total.div(t.expense).mul(100)
      lines.push(`${c.icon ?? '•'} ${c.name} — ${formatShort(c.total)} (${pct.toFixed(0)}%)`)
    }

    // Ty le chi linh hoat: con so cho biet ban con bao nhieu du dia cat giam
    const flexible = t.byCategory
      .filter((c) => c.kind === 'flexible')
      .reduce((sum, c) => sum.plus(c.total), new Decimal(0))
    if (!t.expense.isZero()) {
      const pct = flexible.div(t.expense).mul(100)
      lines.push('', `_Chi linh hoạt chiếm ${pct.toFixed(0)}% — đây là phần cắt được khi cần._`)
    }
  }

  return lines.join('\n')
}

/** Dung chung cho webhook (Vercel) va long polling (may cua ban). */
export { bot }
