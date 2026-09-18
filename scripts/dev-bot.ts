/**
 * Chay bot o may ban, khong can Vercel, khong can duong ham.
 *
 *   npm run bot
 *
 * Che do long polling: bot chu dong hoi Telegram "co tin nhan moi khong",
 * thay vi cho Telegram goi vao. Nho vay may ban khong can dia chi cong
 * khai - chay sau modem nha hay wifi quan cafe deu duoc.
 *
 * Nhan Ctrl+C de dung.
 */
import { bot } from '../src/lib/bot'

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ Thiếu TELEGRAM_BOT_TOKEN. Chạy: npm run check')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error('❌ Thiếu DATABASE_URL. Chạy: npm run check')
    process.exit(1)
  }

  /**
   * Telegram khong cho vua dung webhook vua long polling. Neu truoc do
   * da tro webhook len Vercel thi phai go xuong, khong thi getUpdates se
   * bao loi 409 Conflict.
   */
  await bot.api.deleteWebhook({ drop_pending_updates: true })

  const me = await bot.api.getMe()
  console.log(`\n🤖 @${me.username} đang chạy trên máy bạn (long polling)`)
  console.log('   Mở Telegram, nhắn /start cho bot để bắt đầu.')
  console.log('   Thử: cafe 45k\n')
  console.log('   Ctrl+C để dừng.\n')

  // Dung sau khi nhan Ctrl+C, de khong bo do update dang xu ly giua chung
  process.once('SIGINT', () => bot.stop())
  process.once('SIGTERM', () => bot.stop())

  await bot.start({
    allowed_updates: ['message', 'callback_query'],
    onStart: () => {},
  })
}

main().catch((e) => {
  console.error('❌ Bot dừng vì lỗi:', e)
  process.exit(1)
})
