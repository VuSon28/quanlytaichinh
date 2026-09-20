import { webhookCallback } from 'grammy'
import { bot } from '@/lib/bot'

/**
 * Duong vao khi chay tren Vercel.
 *
 * Toan bo logic cua bot nam o src/lib/bot.ts, dung chung voi che do long
 * polling khi chay o may (scripts/dev-bot.ts). Nho vay thu ban test o
 * may va thu chay that tren Vercel la cung mot doan code.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 55 giay, khong phai 10 giay mac dinh cua grammY.
 *
 * Mac dinh cua grammY la 10s. Qua moc do no NEM LOI, route bat lay roi
 * tra 200 cho Telegram - Telegram tuong xong nen khong gui lai, trong
 * khi viec xu ly van dang chay do. Vercel dong bang container ngay sau
 * khi tra loi, nen cau tra loi ket lai o do cho den khi co tin nhan
 * KHAC danh thuc container day. Nguoi dung thay: hoi mot cau, im lang,
 * nhan them cau nua thi cau tra loi CU moi hien ra.
 *
 * Mot cau hoi gia vang can: khoi dong nguoi + goi Claude + tim web +
 * goi Claude lan hai. 10 giay khong du. Dat sat duoi maxDuration = 60
 * de gioi han that su la cua Vercel, khong phai cua thu vien.
 */
const handle = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 55_000,
})

export async function POST(req: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('[telegram] thieu TELEGRAM_BOT_TOKEN')
    return new Response('not configured', { status: 500 })
  }

  // Telegram gui kem chuoi bi mat de chung minh request den tu ho.
  // Thieu buoc nay thi bat ky ai biet URL deu gia duoc tin nhan.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('forbidden', { status: 403 })
  }

  try {
    return await handle(req)
  } catch (err) {
    console.error('[telegram] loi xu ly update:', err)
    // Tra 200 de Telegram khong gui lai lien tuc cung mot update loi
    return new Response('ok', { status: 200 })
  }
}
