import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

/**
 * Quyen truy cap dashboard.
 *
 * Trang nay hien toan bo tinh hinh tai chinh cua mot nguoi, nen khong the
 * de trong. Nhung cung khong nen dung mat khau: them mot mat khau nua de
 * nho va de lo, trong khi ban da chung minh danh tinh qua Telegram roi.
 *
 * Cach lam: bot phat mot duong link co chu ky va co han. Mo link -> may
 * chu kiem chu ky -> dat cookie -> tu do vao thang. Link het han sau 15
 * phut nen co bi chuyen tiep nham cung khong dung lai duoc; cookie song
 * 30 ngay va chi may chu doc duoc.
 *
 * Khoa ky duoc DAN XUAT tu token bot thay vi them mot bien moi truong:
 * ai co token bot thi da kiem soat duoc toan bo bot roi, nen khong co gi
 * de bao ve them. Cung la cach Telegram tu lam voi Login Widget cua ho.
 */

const LINK_TTL_SECONDS = 15 * 60
const COOKIE_TTL_SECONDS = 30 * 24 * 3600

export const COOKIE_NAME = 'finbot_session'

function signingKey(purpose: string): Buffer {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Thiếu TELEGRAM_BOT_TOKEN')
  return createHash('sha256').update(`${token}|${purpose}`).digest()
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(payload: string, purpose: string): string {
  return createHmac('sha256', signingKey(purpose)).update(payload).digest('base64url')
}

function make(userId: number, ttlSeconds: number, purpose: string): string {
  const payload = b64url(JSON.stringify({
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }))
  return `${payload}.${sign(payload, purpose)}`
}

function verify(token: string | undefined, purpose: string): number | null {
  if (!token) return null

  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = sign(payload, purpose)
  /**
   * So sanh theo thoi gian hang so. So sanh bang === se ket thuc som o
   * byte dau tien khac nhau, va thoi gian chenh lech do - tuy rat nho -
   * ve ly thuyet cho phep do dan tung byte cua chu ky.
   */
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.uid !== 'number' || typeof data.exp !== 'number') return null
    if (data.exp < Math.floor(Date.now() / 1000)) return null
    return data.uid
  } catch {
    return null
  }
}

/** Link mot lan bot gui qua Telegram - song 15 phut */
export function makeLoginToken(userId: number): string {
  return make(userId, LINK_TTL_SECONDS, 'login')
}

export function verifyLoginToken(token: string | undefined): number | null {
  return verify(token, 'login')
}

/** Cookie phien - song 30 ngay */
export function makeSessionToken(userId: number): string {
  return make(userId, COOKIE_TTL_SECONDS, 'session')
}

export function verifySessionToken(token: string | undefined): number | null {
  return verify(token, 'session')
}

export const SESSION_MAX_AGE = COOKIE_TTL_SECONDS
