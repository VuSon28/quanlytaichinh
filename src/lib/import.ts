import ExcelJS from 'exceljs'
import Decimal from 'decimal.js'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { parseCsv, parseTable, type ParseResult, type RawRow } from './statement'
import { parseTransaction } from './parser'
import { loadLearnedKeywords } from './ledger'

const { accounts, categories, transactions } = schema

/**
 * Import sao ke: tu file cua ngan hang thanh giao dich trong so.
 *
 * Nguyen tac: KHONG BAO GIO ghi thang. Sao ke mot thang co the la hang
 * tram dong; neu bot doc sai cot hoac phan loai bay thi don dep con met
 * hon nhap tay. Nen luon dung lai o buoc xem truoc de nguoi dung xac
 * nhan - va chi so lieu that, khong lam tron cho de nhin.
 */

export interface PreparedRow extends RawRow {
  categoryId: number | null
  categoryName: string | null
  isDuplicate: boolean
}

export interface ImportPreview {
  detected: ParseResult['detected']
  prepared: PreparedRow[]
  skipped: ParseResult['skipped']
  newCount: number
  duplicateCount: number
  uncategorizedCount: number
  totalExpense: Decimal
  totalIncome: Decimal
  from: Date | null
  to: Date | null
}

/* ------------------------------------------------------------------ *
 * Doc file
 * ------------------------------------------------------------------ */

export async function parseStatementFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParseResult> {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return parseTable(await readWorkbook(buffer))
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return parseTable(parseCsv(decodeText(buffer)))
  }
  throw new Error(
    'Chỉ đọc được file .csv, .xlsx hoặc .xls. ' +
    'Trong app ngân hàng, chọn xuất sao kê dạng Excel hoặc CSV.',
  )
}

/**
 * Doc text co xu ly UTF-16, vi mot so app ngan hang xuat CSV kieu do va
 * doc nham se ra toan ky tu la.
 */
function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le')
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.from(buffer)
      swapped.swap16()
      return swapped.toString('utf16le')
    }
  }
  return buffer.toString('utf8')
}

async function readWorkbook(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS nhan ArrayBuffer, khong nhan Buffer cua Node truc tiep
  await wb.xlsx.load(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  )

  const sheet = wb.worksheets[0]
  if (!sheet) throw new Error('File Excel không có trang tính nào.')

  const table: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Giu nguyen vi tri cot: o trong giua bang khong duoc lam lech cot
      while (cells.length < colNumber - 1) cells.push('')
      cells.push(cellToString(cell))
    })
    table.push(cells)
  })
  return table
}

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    // Giu dang ISO de parseStatementDate doc duoc chinh xac
    return v.toISOString()
  }
  if (typeof v === 'object') {
    if ('text' in v) return String(v.text)
    if ('result' in v) return String(v.result ?? '')
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
  }
  return String(v)
}

/* ------------------------------------------------------------------ *
 * Chuan bi: phan loai va doi chieu trung lap
 * ------------------------------------------------------------------ */

export async function prepareImport(
  userId: number,
  parsed: ParseResult,
): Promise<ImportPreview> {
  const learned = await loadLearnedKeywords(userId)

  const cats = await db.query.categories.findMany({
    where: and(eq(categories.userId, userId), eq(categories.isArchived, false)),
  })
  const byName = new Map(cats.map((c) => [c.name, c]))

  // Mot truy van cho tat ca, thay vi moi dong mot lan
  const hashes = parsed.rows.map((r) => r.dedupeHash)
  const existing = hashes.length
    ? await db
        .select({ hash: transactions.dedupeHash })
        .from(transactions)
        .where(and(
          eq(transactions.userId, userId),
          inArray(transactions.dedupeHash, hashes),
        ))
    : []
  const seen = new Set(existing.map((e) => e.hash))

  const prepared: PreparedRow[] = []
  let totalExpense = new Decimal(0)
  let totalIncome = new Decimal(0)
  let from: Date | null = null
  let to: Date | null = null

  for (const row of parsed.rows) {
    /**
     * Tai dung bo doc tieng Viet len noi dung sao ke. Bo nho tu khoa ban
     * da day bot khi nhap tay cung ap dung o day - nen cang dung lau,
     * import cang it phai sua.
     */
    const guess = parseTransaction(`${row.description} 1`, learned)
    const categoryName = guess?.categoryName ?? null
    const cat = categoryName ? byName.get(categoryName) : undefined

    // Chi nhan danh muc cung chieu tien: "luong" khong the la khoan chi
    const usable = cat && cat.isIncome === (row.type === 'income') ? cat : undefined

    const isDuplicate = seen.has(row.dedupeHash)
    prepared.push({
      ...row,
      categoryId: usable?.id ?? null,
      categoryName: usable?.name ?? null,
      isDuplicate,
    })

    if (!isDuplicate) {
      if (row.type === 'expense') totalExpense = totalExpense.plus(row.amount)
      else totalIncome = totalIncome.plus(row.amount)
    }
    if (!from || row.occurredAt < from) from = row.occurredAt
    if (!to || row.occurredAt > to) to = row.occurredAt
  }

  const fresh = prepared.filter((r) => !r.isDuplicate)
  return {
    detected: parsed.detected,
    prepared,
    skipped: parsed.skipped,
    newCount: fresh.length,
    duplicateCount: prepared.length - fresh.length,
    uncategorizedCount: fresh.filter((r) => !r.categoryId).length,
    totalExpense,
    totalIncome,
    from,
    to,
  }
}

/* ------------------------------------------------------------------ *
 * Ghi vao so
 * ------------------------------------------------------------------ */

export async function commitImport(
  userId: number,
  preview: ImportPreview,
  accountId: number | null,
): Promise<number> {
  const fresh = preview.prepared.filter((r) => !r.isDuplicate)
  if (!fresh.length) return 0

  let inserted = 0
  let delta = new Decimal(0)

  // Chia lo de khong day mot cau lenh qua lon xuong database
  const BATCH = 200
  for (let i = 0; i < fresh.length; i += BATCH) {
    const chunk = fresh.slice(i, i + BATCH)

    const result = await db.insert(transactions).values(
      chunk.map((r) => ({
        userId,
        type: r.type,
        amount: r.amount.toFixed(2),
        accountId: accountId ?? undefined,
        categoryId: r.categoryId ?? undefined,
        note: r.description.slice(0, 500) || null,
        occurredAt: r.occurredAt,
        source: 'import' as const,
        rawInput: r.description.slice(0, 500),
        isAutoCategorized: true,
        dedupeHash: r.dedupeHash,
      })),
    )
      /**
       * Chan trung lan cuoi o tang database. Buoc doi chieu o tren co the
       * bi qua mat neu ban bam xac nhan hai lan, hoac gui cung file tu hai
       * thiet bi - o do khoa duy nhat la thu duy nhat con giu duoc.
       */
      .onConflictDoNothing({ target: [transactions.userId, transactions.dedupeHash] })
      .returning({ id: transactions.id, type: transactions.type, amount: transactions.amount })

    inserted += result.length
    for (const r of result) {
      const amount = new Decimal(r.amount)
      delta = r.type === 'income' ? delta.plus(amount) : delta.minus(amount)
    }
  }

  if (accountId && !delta.isZero()) {
    await db.update(accounts)
      .set({ balance: sql`${accounts.balance} + ${delta.toFixed(2)}` })
      .where(eq(accounts.id, accountId))
  }

  return inserted
}
