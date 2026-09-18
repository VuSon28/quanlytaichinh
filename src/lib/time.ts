/**
 * Moc thoi gian theo mui gio cua NGUOI DUNG, khong theo gio may chu.
 *
 * May chu Vercel chay theo UTC. Neu dung truc tiep new Date().getDate()
 * thi tu 0h den 7h sang gio Viet Nam, may chu van coi la ngay hom truoc
 * - lenh /homnay se tra ve so lieu sai, va giao dich ghi luc 1h sang
 * ngay 1 se bi tinh vao thang truoc. Voi mot cuon so chi tieu thi day la
 * sai so khong chap nhan duoc.
 *
 * Bien moi truong TZ khong dung duoc vi Vercel cam dat ten do. Va ngay
 * ca khi dat duoc thi no cung sai ve nguyen tac: mui gio thuoc ve nguoi
 * dung, khong thuoc ve may chu.
 */

export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh'

/**
 * Chenh lech giua gio o `tz` va UTC tai thoi diem `date`, tinh bang mili giay.
 * Doc tu Intl nen tu dung ca voi cac vung co gio mua he.
 */
function offsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)

  const g = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)

  const asIfUtc = Date.UTC(
    g('year'), g('month') - 1, g('day'),
    g('hour') % 24, g('minute'), g('second'),
  )
  // Bo phan mili giay cua `date` de phep tru khong bi le
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Cac thanh phan ngay/gio nhu nguoi dung nhin thay tren dong ho cua ho */
export function zonedParts(date: Date, tz = DEFAULT_TZ) {
  const shifted = new Date(date.getTime() + offsetMs(date, tz))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-11
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(), // 0 = Chu nhat
  }
}

/**
 * Doi mot moc lich o mui gio `tz` thanh thoi diem tuyet doi.
 *
 * Goi offsetMs hai lan: lan dau doan bang offset hien tai, lan hai tinh
 * lai bang offset dung tai chinh thoi diem do. Buoc thu hai chi tao khac
 * biet o cac vung doi gio mua he, nhung bo di thi moi nam sai hai lan.
 */
function fromZoned(
  tz: string,
  year: number, month: number, day: number,
  hour = 0, minute = 0,
): Date {
  const naive = Date.UTC(year, month, day, hour, minute)
  const guess = new Date(naive - offsetMs(new Date(naive), tz))
  return new Date(naive - offsetMs(guess, tz))
}

/** 0h00 hom nay theo gio nguoi dung */
export function startOfDay(now: Date, tz = DEFAULT_TZ): Date {
  const p = zonedParts(now, tz)
  return fromZoned(tz, p.year, p.month, p.day)
}

/** 0h00 ngay dau thang theo gio nguoi dung */
export function startOfMonth(now: Date, tz = DEFAULT_TZ): Date {
  const p = zonedParts(now, tz)
  return fromZoned(tz, p.year, p.month, 1)
}

/** Dich `n` thang tu moc dau thang (n am de lui lai) */
export function addMonths(from: Date, n: number, tz = DEFAULT_TZ): Date {
  const p = zonedParts(from, tz)
  return fromZoned(tz, p.year, p.month + n, 1)
}

export function addDays(from: Date, n: number, tz = DEFAULT_TZ): Date {
  const p = zonedParts(from, tz)
  return fromZoned(tz, p.year, p.month, p.day + n)
}

/** So ngay cua thang chua `now`, theo gio nguoi dung */
export function daysInMonth(now: Date, tz = DEFAULT_TZ): number {
  const p = zonedParts(now, tz)
  return new Date(Date.UTC(p.year, p.month + 1, 0)).getUTCDate()
}

/** Nhan thang, vd "Tháng 9/2026" */
export function monthLabel(now: Date, tz = DEFAULT_TZ): string {
  const p = zonedParts(now, tz)
  return `Tháng ${p.month + 1}/${p.year}`
}

/** Ngay/thang de hien trong danh sach giao dich, vd "18/09" */
export function shortDate(date: Date, tz = DEFAULT_TZ): string {
  const p = zonedParts(date, tz)
  return `${String(p.day).padStart(2, '0')}/${String(p.month + 1).padStart(2, '0')}`
}
