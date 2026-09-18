import Decimal from 'decimal.js'

/**
 * Doc so tien viet theo kieu nguoi Viet.
 *
 * Quy tac hau het app ghi chi tieu lam sai: nguoi Viet khong go "45000",
 * ho go "45k". Va ho go "1tr2" chu khong phai "1200000". Neu bot khong
 * hieu duoc cac dang nay thi moi lan nhap deu phai suy nghi, va nguoi
 * dung se bo cuoc sau mot tuan.
 *
 * Cac dang ho tro:
 *   45k, 45K, 45n, 45ng, 45 nghin, 45 ngan   -> 45.000
 *   1tr, 1 trieu, 1m                          -> 1.000.000
 *   1tr2, 1tr200, 1.2tr, 1,2tr                -> 1.200.000
 *   1ty, 1 ty                                 -> 1.000.000.000
 *   45.000, 45,000, 45 000                    -> 45.000
 *   45                                        -> 45.000  (xem ghi chu ben duoi)
 */

/** Ngan cach hang nghin quen thuoc: dau cham, dau phay, khoang trang */
const GROUP_SEP = /[.,\s](?=\d{3}\b)/g

/**
 * So tran khong don vi duoi nguong nay duoc hieu la "nghin".
 * "cafe 45" = 45 nghin, khong ai uong cafe 45 dong.
 * Tren nguong nay thi hieu la so tien day du: "cafe 45000" = 45.000d.
 */
const BARE_NUMBER_AS_THOUSANDS_BELOW = 1000

const UNITS: Array<{ re: RegExp; scale: number }> = [
  { re: /^(ty|tỷ|b)$/i, scale: 1_000_000_000 },
  { re: /^(tr|trieu|triệu|m|củ|cu)$/i, scale: 1_000_000 },
  { re: /^(k|n|ng|nghin|nghìn|ngan|ngàn)$/i, scale: 1_000 },
]

/**
 * Danh sach don vi cho bieu thuc chinh quy, XEP DAI TRUOC NGAN.
 *
 * Thu tu o day khong phai chuyen thang my thuat. Bieu thuc chinh quy
 * chon nhanh dau tien khop duoc, nen neu "n" dung truoc "nghin" thi
 * "55 nghìn" se bi cat thanh "55 n" + "ghìn" - so tien van dung nhung
 * phan mo ta bi hong, va bot se hoc nham tu khoa "an trua ghin".
 */
const UNIT_PATTERN = 'nghìn|nghin|ngàn|ngan|triệu|trieu|tỷ|ty|tr|ng|củ|cu|k|n|m|b'

function unitScale(raw: string): number | null {
  const u = raw.trim()
  for (const { re, scale } of UNITS) if (re.test(u)) return scale
  return null
}

/**
 * Tach mot chuoi so tien don le thanh Decimal (don vi dong).
 * Tra ve null neu khong doc duoc.
 */
export function parseAmount(input: string): Decimal | null {
  const s = input.trim().toLowerCase()
  if (!s) return null

  // Dang "1tr2" / "1tr200" / "2ty5": phan du sau don vi la bac thap hon.
  // "1tr2" -> 1 trieu + 2 tram nghin (chu so dau tien sau don vi la hang
  // ngay ben duoi don vi do, dung nhu cach nguoi Viet doc).
  const compound = s.match(
    new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})\\s*(\\d+)$`),
  )
  if (compound) {
    const [, headRaw, unitRaw, tailRaw] = compound
    const scale = unitScale(unitRaw)
    if (scale === null) return null
    const head = new Decimal(headRaw.replace(',', '.')).mul(scale)
    // "1tr2" -> tail "2" chiem 1 chu so, bac duoi la scale/10
    // "1tr25" -> tail "25", bac duoi la scale/100
    const tail = new Decimal(tailRaw).mul(scale).div(Math.pow(10, tailRaw.length))
    return head.plus(tail)
  }

  // Dang "45k" / "1.2tr" / "1,2 trieu"
  const simple = s.match(
    new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})$`),
  )
  if (simple) {
    const [, numRaw, unitRaw] = simple
    const scale = unitScale(unitRaw)
    if (scale === null) return null
    return new Decimal(numRaw.replace(',', '.')).mul(scale)
  }

  // Dang so tran, co the co ngan cach hang nghin
  const bare = s.replace(GROUP_SEP, '')
  if (!/^\d+(?:[.,]\d+)?$/.test(bare)) return null

  const value = new Decimal(bare.replace(',', '.'))
  // Neu chuoi goc co ngan cach hang nghin thi day la so tien day du roi.
  const hadGrouping = bare !== s.replace(/\s/g, '')
  if (!hadGrouping && value.lt(BARE_NUMBER_AS_THOUSANDS_BELOW)) {
    return value.mul(1_000)
  }
  return value
}

/** Tim so tien dau tien xuat hien trong mot cau tu do. */
export function extractAmount(text: string): { amount: Decimal; matched: string } | null {
  // Bat cac cum co don vi truoc (chinh xac hon), sau do moi den so tran.
  const patterns = [
    new RegExp(`(\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_PATTERN})\\s*\\d*)`, 'i'),
    /(\d{1,3}(?:[.,\s]\d{3})+)/,
    /(\d+(?:[.,]\d+)?)/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue
    const amount = parseAmount(m[1])
    if (amount && amount.gt(0)) return { amount, matched: m[1] }
  }
  return null
}

/** 45000 -> "45.000 d" */
export function formatVnd(value: Decimal | string | number): string {
  const d = new Decimal(value)
  const rounded = d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  return `${rounded.toNumber().toLocaleString('vi-VN')} đ`
}

/** 45000 -> "45k", 1200000 -> "1,2tr" - dung cho bang bao cao cho gon */
export function formatShort(value: Decimal | string | number): string {
  const d = new Decimal(value)
  const abs = d.abs()
  if (abs.gte(1_000_000_000)) return `${trim(d.div(1_000_000_000))}tỷ`
  if (abs.gte(1_000_000)) return `${trim(d.div(1_000_000))}tr`
  if (abs.gte(1_000)) return `${trim(d.div(1_000))}k`
  return d.toDecimalPlaces(0).toString()
}

function trim(d: Decimal): string {
  return d.toDecimalPlaces(1).toString().replace('.', ',')
}
