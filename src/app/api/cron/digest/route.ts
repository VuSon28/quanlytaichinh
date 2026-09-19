import { bot } from '@/lib/bot'
import { buildDueDigests } from '@/lib/digest'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Bao cao dinh ky. Chay MOI GIO.
 *
 * Ham nay tu loc ai da den gio nhan bao cao theo mui gio va gio da chon
 * cua tung nguoi, nen goi moi gio la phuc vu duoc moi mui gio ma khong
 * can nhieu lich chay khac nhau.
 *
 * Goi tu cron-job.org (mien phi, tan suat tuy y):
 *   GET https://<ten-app>.vercel.app/api/cron/digest
 *   Header: authorization: Bearer <CRON_SECRET>
 *
 * Vercel Hobby chi cho cron noi bo 1 lan/ngay nen khong dung duoc cho
 * viec nay - dich vu cron ben ngoai vua mien phi vua linh hoat hon.
 */

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ ok: false, error: 'CRON_SECRET chưa đặt' }, { status: 500 })
  }

  /**
   * Endpoint nay gui tin nhan den nguoi dung that, nen phai chan nguoi
   * la. Thieu buoc nay thi bat ky ai biet dia chi deu spam duoc bot.
   */
  const auth = req.headers.get('authorization')
  const fromQuery = new URL(req.url).searchParams.get('key')
  if (auth !== `Bearer ${secret}` && fromQuery !== secret) {
    return new Response('forbidden', { status: 403 })
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return Response.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN chưa đặt' }, { status: 500 })
  }

  const now = new Date()
  let sent = 0
  const errors: string[] = []

  try {
    const digests = await buildDueDigests(now)

    for (const d of digests) {
      try {
        await bot.api.sendMessage(d.telegramId, d.text, { parse_mode: 'Markdown' })
        sent++
      } catch (e) {
        // Mot nguoi gui hong khong duoc lam hong ca lo
        errors.push(`${d.telegramId}: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    console.error('[cron/digest] loi:', e)
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    )
  }

  return Response.json({
    ok: true,
    at: now.toISOString(),
    sent,
    ...(errors.length ? { errors } : {}),
  })
}
