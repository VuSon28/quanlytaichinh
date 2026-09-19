/**
 * Tao bang net_worth_snapshots.
 * Chay: npx tsx --env-file=.env.local scripts/migrate-networth.ts
 *
 * Viet tay thay vi dung drizzle-kit push, vi cong cu do dang gap loi noi
 * bo khi doc lai schema hien co tren Supabase. Lenh nay chay lai duoc
 * nhieu lan ma khong gay hai (IF NOT EXISTS).
 */
import postgres from 'postgres'

export {}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Thiếu DATABASE_URL')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1 })

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      id         bigserial PRIMARY KEY,
      user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      taken_on   date NOT NULL,
      liquid     numeric(15,2) NOT NULL,
      invested   numeric(15,2) NOT NULL,
      debt       numeric(15,2) NOT NULL,
      total      numeric(15,2) NOT NULL
    )
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS nw_user_date_idx
    ON net_worth_snapshots (user_id, taken_on)
  `

  const [{ count }] = await sql<Array<{ count: string }>>`
    SELECT count(*)::text AS count FROM net_worth_snapshots
  `
  console.log(`✅ Bảng net_worth_snapshots sẵn sàng (${count} dòng)`)

  await sql.end()
}

main().catch(async (e) => {
  console.error('❌ Thất bại:', e.message)
  await sql.end().catch(() => {})
  process.exit(1)
})
