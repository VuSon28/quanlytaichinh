/**
 * Kiem thu lop tro chuyen.
 * Chay: npx tsx scripts/test-chat.ts
 *
 * Phan mac dinh chay OFFLINE - khong goi API, khong ton tien. No kiem
 * thu thu quan trong nhat: cau nao di den AI, cau nao di den bo luat.
 * Dinh tuyen sai thi mot cau hoi bong nhien tro thanh mot khoan chi.
 *
 * Them co --live de goi that mot lan (can ANTHROPIC_API_KEY):
 *   npx tsx --env-file=.env.local scripts/test-chat.ts --live
 */
import { looksLikeChat } from '../src/lib/ai'
import { parseTransaction } from '../src/lib/parser'

let pass = 0
let fail = 0

function expect(label: string, actual: boolean, want: boolean) {
  if (actual === want) {
    pass++
    console.log(`  ok    ${label}`)
  } else {
    fail++
    console.log(`  FAIL  ${label}  (mong đợi ${want}, nhận ${actual})`)
  }
}

console.log('\n── Câu ghi chép: phải đi vào bộ luật, KHÔNG gọi AI ──')
for (const s of [
  'cafe 45k',
  'đổ xăng 80k',
  'ăn trưa 55 nghìn',
  '+20tr lương',
  'tiền nhà 3 triệu',
  'grab 32k',
  'mua vàng 2ty5',
]) {
  expect(`"${s}"`, looksLikeChat(s), false)
}

console.log('\n── Câu trò chuyện: phải đi đến AI ──')
for (const s of [
  'tháng này tôi tiêu nhiều quá phải không?',
  'còn bao nhiêu tiền ăn ngoài nữa',
  'có nên mua xe 500 triệu không',
  'tư vấn giúp mình cách để dành tiền',
  'mệt quá, tháng này tiêu hoang thật sự, không biết phải làm sao nữa đây',
  'giải thích giùm tỷ lệ tiết kiệm là gì',
  'chào bạn',
]) {
  expect(`"${s}"`, looksLikeChat(s), true)
}

console.log('\n── Cái bẫy quan trọng nhất ──')
{
  /**
   * Bo luat DOC RA duoc 500 trieu tu cau nay. Neu dinh tuyen khong
   * chan lai, ban vua bi ghi mot khoan chi 500 trieu chi vi hoi mot
   * cau. Day la ly do looksLikeChat phai chay truoc parser.
   */
  const bay = 'có nên mua xe 500 triệu không?'
  const doc = parseTransaction(bay)
  console.log(`  bộ luật đọc ra: ${doc ? `${doc.amount} (${doc.type})` : 'không có gì'}`)
  expect('  nhưng định tuyến chặn lại trước', looksLikeChat(bay), true)
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`Đạt: ${pass}   Hỏng: ${fail}`)
console.log(`${'─'.repeat(50)}\n`)

if (!process.argv.includes('--live')) {
  console.log('Thêm --live để thử một lượt trò chuyện thật.\n')
  process.exit(fail > 0 ? 1 : 0)
}

/* ------------------------------------------------------------------ *
 * Goi that mot lan
 * ------------------------------------------------------------------ */

async function live() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Thiếu ANTHROPIC_API_KEY — không chạy được phần --live')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error('❌ Thiếu DATABASE_URL — phần --live cần đọc sổ thật')
    process.exit(1)
  }

  const { converse } = await import('../src/lib/ai')
  const { getOrCreateUser } = await import('../src/lib/ledger')

  const owner = Number(process.env.OWNER_TELEGRAM_ID || 0)
  if (!owner) {
    console.error('❌ Thiếu OWNER_TELEGRAM_ID')
    process.exit(1)
  }

  const u = await getOrCreateUser(owner)
  const cau = process.argv[process.argv.indexOf('--live') + 1]
    ?? 'tháng này mình tiêu thế nào rồi?'

  console.log(`Bạn:  ${cau}`)
  const t0 = Date.now()
  const { reply, toolCalls } = await converse(
    { id: u.id, displayName: u.displayName, timezone: u.timezone },
    cau,
  )
  console.log(`\nBot:  ${reply}`)
  console.log(`\n(${toolCalls} lần gọi công cụ, ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`)
  process.exit(0)
}

live().catch((e) => {
  console.error('❌ Thất bại:', e)
  process.exit(1)
})
