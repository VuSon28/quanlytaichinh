import type Decimal from 'decimal.js'
import { extractAmount } from './money'
import { normalize, SEED_KEYWORD_INDEX } from './categories'

/**
 * Bo doc giao dich bang luat - khong goi AI, chay trong vai mili giay.
 *
 * Day la lop xu ly dau tien va bat duoc phan lon giao dich hang ngay.
 * Chi khi lop nay khong doan duoc danh muc thi bot moi hoi lai ban mot
 * lan (roi nho vinh vien), va chi khi ban bat che do AI thi moi goi
 * Claude cho nhung cau that su phuc tap.
 */

export type TxType = 'expense' | 'income'

export interface ParsedTx {
  type: TxType
  amount: Decimal
  /** Phan mo ta con lai sau khi tach so tien ra */
  note: string
  /** Ten danh muc doan duoc, null neu chua biet */
  categoryName: string | null
  /** Tu khoa da khop - dung de ghi vao bo nho khi ban xac nhan */
  matchedKeyword: string | null
  /**
   * exact  - khop tu khoa da hoc cua rieng ban (tin cay nhat)
   * seed   - khop tu dien mac dinh
   * none   - khong doan duoc, can hoi lai
   */
  confidence: 'exact' | 'seed' | 'none'
}

/** Tu bao hieu day la khoan THU, khong phai chi */
const INCOME_MARKERS = [
  'luong', 'nhan luong', 'thuong', 'bonus', 'thu', 'duoc tra', 'duoc cho',
  'hoan tien', 'refund', 'co tuc', 'lai ngan hang', 'ban duoc', 'thu nhap',
  'tra lai', 'duoc tang', 'nhan tien',
]

/**
 * Bo nho da hoc cua nguoi dung, nap tu bang keyword_map.
 * Truyen vao duoi dang Map de parser khong phai biet gi ve database.
 */
export type LearnedKeywords = ReadonlyMap<string, string>

export function parseTransaction(
  input: string,
  learned: LearnedKeywords = new Map(),
): ParsedTx | null {
  const raw = input.trim()
  if (!raw) return null

  // Dau + o dau cau la cach nhanh de bao "day la khoan thu": "+20tr luong"
  let forcedType: TxType | null = null
  let body = raw
  if (/^\+/.test(raw)) {
    forcedType = 'income'
    body = raw.slice(1).trim()
  } else if (/^-/.test(raw)) {
    forcedType = 'expense'
    body = raw.slice(1).trim()
  }

  const found = extractAmount(body)
  if (!found) return null

  // Bo so tien ra, phan con lai la mo ta
  const note = body.replace(found.matched, ' ').replace(/\s+/g, ' ').trim()
  const normalizedNote = normalize(note)

  const type: TxType =
    forcedType ?? (hasIncomeMarker(normalizedNote) ? 'income' : 'expense')

  const match = matchCategory(normalizedNote, learned)

  return {
    type,
    amount: found.amount,
    note,
    categoryName: match.categoryName,
    matchedKeyword: match.keyword,
    confidence: match.confidence,
  }
}

function hasIncomeMarker(normalizedNote: string): boolean {
  return INCOME_MARKERS.some((m) => containsPhrase(normalizedNote, normalize(m)))
}

interface CategoryMatch {
  categoryName: string | null
  keyword: string | null
  confidence: ParsedTx['confidence']
}

/**
 * Tim danh muc. Uu tien theo thu tu:
 *   1. Tu khoa ban da day bot truoc day  (chinh xac nhat - la thoi quen rieng)
 *   2. Tu dien mac dinh
 * Trong moi tang, cum tu DAI hon thang vi no cu the hon:
 * "tien dien" phai thang "dien", "sua xe" phai thang "sua".
 */
function matchCategory(normalizedNote: string, learned: LearnedKeywords): CategoryMatch {
  if (!normalizedNote) {
    return { categoryName: null, keyword: null, confidence: 'none' }
  }

  const fromLearned = bestMatch(normalizedNote, learned)
  if (fromLearned) {
    return {
      categoryName: fromLearned.categoryName,
      keyword: fromLearned.keyword,
      confidence: 'exact',
    }
  }

  const fromSeed = bestMatch(normalizedNote, SEED_KEYWORD_INDEX)
  if (fromSeed) {
    return {
      categoryName: fromSeed.categoryName,
      keyword: fromSeed.keyword,
      confidence: 'seed',
    }
  }

  return { categoryName: null, keyword: null, confidence: 'none' }
}

function bestMatch(
  normalizedNote: string,
  index: ReadonlyMap<string, string>,
): { keyword: string; categoryName: string } | null {
  let best: { keyword: string; categoryName: string } | null = null

  for (const [keyword, categoryName] of index) {
    if (!containsPhrase(normalizedNote, keyword)) continue
    if (!best || keyword.length > best.keyword.length) {
      best = { keyword, categoryName }
    }
  }
  return best
}

/**
 * Khop theo ranh gioi tu, khong khop giua tu.
 * Tranh truong hop "ca" khop vao "cafe", hay "no" khop vao "nong".
 */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false
  const idx = haystack.indexOf(needle)
  if (idx === -1) return false

  const before = idx === 0 ? ' ' : haystack[idx - 1]
  const afterIdx = idx + needle.length
  const after = afterIdx >= haystack.length ? ' ' : haystack[afterIdx]

  return before === ' ' && after === ' '
}
