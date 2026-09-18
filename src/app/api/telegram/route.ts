import { webhookCallback } from 'grammy'
import { bot } from '@/lib/bot'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Duong vao khi chay tren Vercel.
 *
 * Toan bo logic cua bot nam o src/lib/bot.ts, dung chung voi che do long
 * polling khi chay o may (scripts/dev-bot.ts). Nho vay thu ban test o
 * may va thu chay that tren Vercel la cung mot doan code.
 */
const handle = webhookCallback(bot, 'std/http')

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
