import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { db, schema } from '@/db'

const { chatMessages } = schema

/**
 * Bo nho hoi thoai.
 *
 * Hai con so duoi day quyet dinh bot "nho dai" hay "nho ngan". Chung la
 * su danh doi: nho cang nhieu thi cau tra loi cang co ngu canh, nhung
 * moi luot lai gui lai toan bo cho Claude - dat hon va cham hon.
 *
 * 20 luot du de giu mach mot cuoc noi chuyen. 12 tieng nghia la sang
 * hom sau ban nhan "the con hom qua?" thi bot van hieu, con chuyen tuan
 * truoc thi khong - va do la dung: no da nam trong so sach roi, hoi
 * bang du lieu that chinh xac hon la hoi bang tri nho.
 */
const MAX_TURNS = 20
const REMEMBER_HOURS = 12

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export async function loadHistory(userId: number): Promise<ChatTurn[]> {
  const since = new Date(Date.now() - REMEMBER_HOURS * 3600_000)

  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(and(
      eq(chatMessages.userId, userId),
      gte(chatMessages.createdAt, since),
    ))
    .orderBy(desc(chatMessages.createdAt))
    .limit(MAX_TURNS)

  // Lay cac luot MOI nhat nhung tra ve theo thu tu thoi gian
  const turns = rows.reverse().map((r) => ({
    role: r.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: r.content,
  }))

  /**
   * Claude bat buoc luot dau tien phai la cua nguoi dung. Khi cat 20
   * luot gan nhat, cho cat co the roi dung vao cau tra loi cua bot -
   * bo no di, neu khong ca request bi tu choi.
   */
  while (turns.length && turns[0].role === 'assistant') turns.shift()

  return turns
}

export async function remember(userId: number, role: 'user' | 'assistant', content: string) {
  const text = content.trim()
  if (!text) return
  await db.insert(chatMessages).values({ userId, role, content: text })
}

export async function forget(userId: number) {
  await db.delete(chatMessages).where(eq(chatMessages.userId, userId))
}

/**
 * Don dep cac luot qua cu.
 *
 * Khong co buoc nay thi bang cu phinh mai. Goi kem luc ghi cho re, thay
 * vi dung them mot cong viec dinh ky nua.
 */
export async function pruneOldChat(userId: number) {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600_000)
  await db.delete(chatMessages).where(and(
    eq(chatMessages.userId, userId),
    lt(chatMessages.createdAt, cutoff),
  ))
}
