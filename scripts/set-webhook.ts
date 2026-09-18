/**
 * Dang ky webhook voi Telegram.
 * Chay MOT LAN sau khi deploy len Vercel:
 *
 *   npx tsx scripts/set-webhook.ts https://ten-app.vercel.app
 *
 * Chay lai bat cu luc nao neu doi ten mien hoac doi secret.
 */
export {}

const base = process.argv[2]
const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET

if (!base) {
  console.error('Thiếu URL. Ví dụ: npx tsx scripts/set-webhook.ts https://finbot.vercel.app')
  process.exit(1)
}
if (!token) {
  console.error('Thiếu TELEGRAM_BOT_TOKEN trong môi trường (.env.local)')
  process.exit(1)
}

const url = `${base.replace(/\/$/, '')}/api/telegram`

async function main() {
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secret || undefined,
      // Bo qua update ton dong tu lan chay truoc, tranh bot xu ly lai hang loat
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query'],
    }),
  })

  const json = (await res.json()) as { ok: boolean; description?: string }
  if (json.ok) {
    console.log(`✅ Đã trỏ webhook về ${url}`)
    if (!secret) {
      console.log('⚠️  Chưa đặt TELEGRAM_WEBHOOK_SECRET — nên đặt để chặn request giả mạo.')
    }
  } else {
    console.error('❌ Thất bại:', json.description)
    process.exit(1)
  }
}

main()
