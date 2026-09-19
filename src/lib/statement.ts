import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { normalize } from './categories'

/**
 * Doc sao ke ngan hang.
 *
 * Moi ngan hang Viet Nam xuat mot kieu khac nhau, va cung mot ngan hang
 * doi dinh dang sau vai lan cap nhat app. Nen cho nay KHONG viet cung
 * cho tung ngan hang, ma tu nhan dien cot theo tieu de: tim cot nao la
 * ngay, cot nao la so tien, cot nao la noi dung. Cach nay chay duoc voi
 * file cua ngan hang chua tung gap, va khong hong khi ho doi dinh dang.
 *
 * Ho tro ca hai kieu bo cuc pho bien:
 *  - Hai cot rieng: "Ghi no" (tien ra) va "Ghi co" (tien vao)
 *  - Mot cot "So tien" co dau am/duong
 */

export interface RawRow {
  occurredAt: Date
  amount: Decimal
  type: 'expense' | 'income'
  description: string
  /** Van tay chong ghi trung khi import lai cung mot file */
  dedupeHash: string
}

export interface ParseResult {
  rows: RawRow[]
  /** Cac dong bo qua kem ly do - de nguoi dung biet chuyen gi da xay ra */
  skipped: Array<{ line: number; reason: string }>
  detected: {
    date: string
    description: string
    debit?: string
    credit?: string
    amount?: string
  }
}

/* ------------------------------------------------------------------ *
 * Nhan dien cot theo tieu de
 * ------------------------------------------------------------------ */

const HEADER_HINTS = {
  date: [
    'ngay giao dich', 'ngay gd', 'ngay hieu luc', 'ngay ghi so', 'ngay',
    'transaction date', 'trans date', 'value date', 'date', 'thoi gian',
  ],
  description: [
    'noi dung giao dich', 'noi dung', 'dien giai', 'mo ta', 'chi tiet',
    'description', 'remark', 'detail', 'narrative', 'transaction detail',
  ],
  debit: [
    'ghi no', 'phat sinh no', 'so tien ghi no', 'tien ra', 'debit',
    'withdrawal', 'rut tien', 'no',
  ],
  credit: [
    'ghi co', 'phat sinh co', 'so tien ghi co', 'tien vao', 'credit',
    'deposit', 'nop tien', 'co',
  ],
  amount: [
    'so tien giao dich', 'so tien gd', 'so tien', 'gia tri', 'amount',
    'transaction amount', 'value',
  ],
} as const

/**
 * Chon cot khop nhat cho mot vai tro.
 *
 * Goi y DAI duoc uu tien vi no cu the hon: "so tien ghi no" phai thang
 * "so tien". Khong the chi lay goi y dau tien khop, vi cac cot trong sao
 * ke thuong co ten gan giong nhau.
 */
function pickColumn(headers: string[], hints: readonly string[]): number {
  let best = -1
  let bestLen = 0

  headers.forEach((h, i) => {
    const norm = normalize(h)
    if (!norm) return
    for (const hint of hints) {
      if (!matchesHint(norm, hint)) continue
      if (hint.length > bestLen) { best = i; bestLen = hint.length }
    }
  })
  return best
}

/**
 * Khop theo RANH GIOI TU, khong khop giua tu.
 *
 * Bat buoc phai nhu vay: goi y "no" (ghi no) neu khop kieu chuoi con se
 * trung vao "noi dung", khien bot tuong cot mo ta la cot so tien roi bo
 * qua toan bo giao dich. Tuong tu "co" (ghi co) se trung vao rat nhieu
 * tu tieng Viet khac.
 */
function matchesHint(normalizedHeader: string, hint: string): boolean {
  return ` ${normalizedHeader} `.includes(` ${hint} `)
}

/* ------------------------------------------------------------------ *
 * Doc so tien va ngay thang
 * ------------------------------------------------------------------ */

/**
 * Doc so tien trong sao ke. Khac voi money.ts - o day KHONG duoc doan
 * "45 nghia la 45 nghin", vi sao ke luon ghi so tien day du.
 */
export function parseStatementAmount(raw: string): Decimal | null {
  let s = String(raw ?? '').trim()
  if (!s) return null

  // Bo ky hieu tien te va chu di kem
  s = s.replace(/\s*(vnd|vnđ|đ|d|usd|\$)\s*$/i, '').trim()
  // Ngoac don nghia la so am, theo quy uoc ke toan: (1.234) = -1234
  const negByParens = /^\(.*\)$/.test(s)
  if (negByParens) s = s.slice(1, -1)

  const neg = negByParens || s.startsWith('-')
  s = s.replace(/^[+-]/, '').trim()
  if (!s) return null

  /**
   * Phan biet dau ngan cach hang nghin voi dau thap phan.
   * "1.234.567" la mot trieu hai, con "1234.56" la mot nghin hai phay
   * nam sau. Quy tac: dau CUOI CUNG la thap phan neu sau no co dung 1-2
   * chu so VA chuoi co nhieu hon mot loai dau, hoac chi co mot dau.
   */
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  const lastSep = Math.max(lastDot, lastComma)

  if (lastSep !== -1) {
    /**
     * Sau dau cuoi cung co 1-2 chu so thi do la phan thap phan
     * ("1234.56"); co dung 3 chu so thi do la ngan cach hang nghin
     * ("1.234" = mot nghin hai tram ba muoi tu, khong phai 1,234).
     */
    const after = s.length - lastSep - 1
    const isDecimal = after >= 1 && after <= 2

    if (isDecimal) {
      const intPart = s.slice(0, lastSep).replace(/[.,\s]/g, '')
      const decPart = s.slice(lastSep + 1)
      s = `${intPart}.${decPart}`
    } else {
      s = s.replace(/[.,\s]/g, '')
    }
  } else {
    s = s.replace(/\s/g, '')
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const d = new Decimal(s)
  return neg ? d.negated() : d
}

/** Doc ngay theo cac dinh dang sao ke Viet Nam thuong dung */
export function parseStatementDate(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw

  const s = String(raw ?? '').trim()
  if (!s) return null

  // dd/MM/yyyy hoac dd-MM-yyyy (pho bien nhat o Viet Nam)
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (dmy) {
    const [, d, m, y] = dmy
    return safeDate(Number(y), Number(m), Number(d), s)
  }

  // yyyy-MM-dd
  const ymd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (ymd) {
    const [, y, m, d] = ymd
    return safeDate(Number(y), Number(m), Number(d), s)
  }

  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function safeDate(y: number, m: number, d: number, original: string): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null

  // Giu lai gio phut neu co, de hai giao dich cung ngay khong bi coi la trung
  const time = original.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  const hh = time ? Number(time[1]) : 0
  const mm = time ? Number(time[2]) : 0
  const ss = time && time[3] ? Number(time[3]) : 0

  const date = new Date(Date.UTC(y, m - 1, d, hh, mm, ss))
  return Number.isNaN(date.getTime()) ? null : date
}

/* ------------------------------------------------------------------ *
 * Doc CSV
 * ------------------------------------------------------------------ */

/**
 * Tach CSV co xu ly dau ngoac kep.
 * Tu viet thay vi them thu vien: sao ke la CSV don gian, va mot ham 40
 * dong doc duoc thi tot hon mot phu thuoc ngoai phai theo doi ve sau.
 */
export function parseCsv(text: string): string[][] {
  // Bo BOM - Excel hay them vao va no lam hong tieu de cot dau tien
  const src = text.replace(/^﻿/, '')
  const delimiter = detectDelimiter(src)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const c = src[i]

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
      continue
    }

    if (c === '"') { inQuotes = true; continue }
    if (c === delimiter) { row.push(field); field = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += c
  }

  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim()))
}

/** Doan dau phan cach bang cach dem o vai dong dau */
function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4000)
  const counts = [',', ';', '\t', '|'].map((d) => ({
    d,
    n: (sample.match(new RegExp(`\\${d}`, 'g')) ?? []).length,
  }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].d : ','
}

/* ------------------------------------------------------------------ *
 * Bien bang thanh giao dich
 * ------------------------------------------------------------------ */

export function parseTable(table: string[][]): ParseResult {
  const headerIdx = findHeaderRow(table)
  if (headerIdx === -1) {
    throw new Error(
      'Không tìm thấy dòng tiêu đề. File cần có cột ngày, số tiền và nội dung.',
    )
  }

  const headers = table[headerIdx].map((h) => String(h ?? '').trim())
  const dateCol = pickColumn(headers, HEADER_HINTS.date)
  const descCol = pickColumn(headers, HEADER_HINTS.description)
  const debitCol = pickColumn(headers, HEADER_HINTS.debit)
  const creditCol = pickColumn(headers, HEADER_HINTS.credit)
  const amountCol = pickColumn(headers, HEADER_HINTS.amount)

  if (dateCol === -1) throw new Error('Không tìm thấy cột ngày giao dịch.')
  if (debitCol === -1 && creditCol === -1 && amountCol === -1) {
    throw new Error('Không tìm thấy cột số tiền.')
  }

  const rows: RawRow[] = []
  const skipped: ParseResult['skipped'] = []

  for (let i = headerIdx + 1; i < table.length; i++) {
    const cells = table[i]
    const line = i + 1

    const occurredAt = parseStatementDate(cells[dateCol])
    if (!occurredAt) {
      // Dong tong cong / chan trang khong co ngay - bo qua khong bao loi
      skipped.push({ line, reason: 'không đọc được ngày' })
      continue
    }

    const money = readAmount(cells, { debitCol, creditCol, amountCol })
    if (!money) {
      skipped.push({ line, reason: 'không đọc được số tiền' })
      continue
    }

    const description = descCol === -1
      ? ''
      : String(cells[descCol] ?? '').replace(/\s+/g, ' ').trim()

    rows.push({
      occurredAt,
      amount: money.amount,
      type: money.type,
      description,
      dedupeHash: makeHash(occurredAt, money.amount, description),
    })
  }

  return {
    rows,
    skipped,
    detected: {
      date: headers[dateCol],
      description: descCol === -1 ? '(không có)' : headers[descCol],
      ...(debitCol !== -1 ? { debit: headers[debitCol] } : {}),
      ...(creditCol !== -1 ? { credit: headers[creditCol] } : {}),
      ...(amountCol !== -1 && debitCol === -1 && creditCol === -1
        ? { amount: headers[amountCol] }
        : {}),
    },
  }
}

function readAmount(
  cells: string[],
  cols: { debitCol: number; creditCol: number; amountCol: number },
): { amount: Decimal; type: 'expense' | 'income' } | null {
  // Uu tien cap cot no/co vi no noi ro chieu tien, khong phai doan dau
  if (cols.debitCol !== -1 || cols.creditCol !== -1) {
    const debit = cols.debitCol === -1
      ? null
      : parseStatementAmount(cells[cols.debitCol] ?? '')
    const credit = cols.creditCol === -1
      ? null
      : parseStatementAmount(cells[cols.creditCol] ?? '')

    if (debit?.gt(0)) return { amount: debit, type: 'expense' }
    if (credit?.gt(0)) return { amount: credit, type: 'income' }
    return null
  }

  const value = parseStatementAmount(cells[cols.amountCol] ?? '')
  if (!value || value.isZero()) return null
  return value.lt(0)
    ? { amount: value.abs(), type: 'expense' }
    : { amount: value, type: 'income' }
}

/**
 * Tim dong tieu de.
 *
 * Sao ke thuong co vai dong dau la ten ngan hang, so tai khoan, ky sao
 * ke... roi moi den bang. Nen phai do tim dong nao trong ra giong tieu
 * de nhat, thay vi mac dinh lay dong dau tien.
 */
function findHeaderRow(table: string[][]): number {
  const limit = Math.min(table.length, 30)
  for (let i = 0; i < limit; i++) {
    const headers = table[i].map((h) => String(h ?? ''))
    const hasDate = pickColumn(headers, HEADER_HINTS.date) !== -1
    const hasMoney = pickColumn(headers, HEADER_HINTS.debit) !== -1
      || pickColumn(headers, HEADER_HINTS.credit) !== -1
      || pickColumn(headers, HEADER_HINTS.amount) !== -1
    if (hasDate && hasMoney) return i
  }
  return -1
}

/**
 * Van tay mot giao dich: ngay + so tien + noi dung da chuan hoa.
 *
 * Dung de import lai cung mot file khong sinh ban trung. Khong dua so
 * du vao hash vi so du thay doi neu ban import theo thu tu khac.
 */
function makeHash(date: Date, amount: Decimal, description: string): string {
  const key = [
    date.toISOString().slice(0, 10),
    amount.toFixed(2),
    normalize(description).slice(0, 80),
  ].join('|')
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}
