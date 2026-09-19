/**
 * Them cot last_digest_on vao bang users.
 * Chay: npm run db:migrate:digest
 *
 * Chay lai nhieu lan khong gay hai.
 */
import postgres from 'postgres'

export {}

const url = process.env.DATABASE_URL
if (!url) { console.error('Thiếu DATABASE_URL'); process.exit(1) }

const sql = postgres(url, { prepare: false, max: 1 })

async function main() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_on date`
  const [row] = await sql<Array<{ n: string }>>`
    SELECT count(*)::text AS n FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_digest_on'
  `
  console.log(row.n === '1' ? '✅ Cột last_digest_on sẵn sàng' : '❌ Không tạo được cột')
  await sql.end()
}

main().catch(async (e) => {
  console.error('❌ Thất bại:', e.message)
  await sql.end().catch(() => {})
  process.exit(1)
})
