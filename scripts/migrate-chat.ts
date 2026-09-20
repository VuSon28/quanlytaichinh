/**
 * Tao bang chat_messages - noi bot nho lai cuoc tro chuyen.
 * Chay: npm run db:migrate:chat
 *
 * Chay lai nhieu lan khong gay hai.
 */
import postgres from 'postgres'

export {}

const url = process.env.DATABASE_URL
if (!url) { console.error('Thiếu DATABASE_URL'); process.exit(1) }

const sql = postgres(url, { prepare: false, max: 1 })

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          bigserial PRIMARY KEY,
      user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role        text NOT NULL,
      content     text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS chat_user_time_idx
      ON chat_messages (user_id, created_at)
  `

  const [row] = await sql<Array<{ n: string }>>`
    SELECT count(*)::text AS n FROM information_schema.tables
    WHERE table_name = 'chat_messages'
  `
  console.log(row.n === '1' ? '✅ Bảng chat_messages sẵn sàng' : '❌ Không tạo được bảng')
  await sql.end()
}

main().catch(async (e) => {
  console.error('❌ Thất bại:', e.message)
  await sql.end().catch(() => {})
  process.exit(1)
})
