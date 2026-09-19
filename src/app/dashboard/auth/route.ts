import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  verifyLoginToken, makeSessionToken, COOKIE_NAME, SESSION_MAX_AGE,
} from '@/lib/dashboard-auth'

export const runtime = 'nodejs'

/**
 * Doi link mot lan tu Telegram thanh cookie phien.
 *
 * Doi ngay sang cookie roi chuyen huong, de token khong nam lai tren
 * thanh dia chi - noi no de bi luu vao lich su duyet web hoac lo qua
 * header Referer khi trang co tai tai nguyen ben ngoai.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('t') ?? undefined
  const userId = verifyLoginToken(token)

  if (!userId) {
    return new Response(
      'Link không hợp lệ hoặc đã hết hạn. Nhắn /web cho bot để lấy link mới.',
      { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  const jar = await cookies()
  jar.set(COOKIE_NAME, makeSessionToken(userId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })

  redirect('/dashboard')
}
