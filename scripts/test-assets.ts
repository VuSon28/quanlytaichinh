/**
 * Kiem thu tai san, no va gia tri tai san rong tren database THAT.
 * Chay: npm run test:assets
 */
import Decimal from 'decimal.js'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db'
import { formatVnd } from '../src/lib/money'
import { getOrCreateUser, setAccountBalance } from '../src/lib/ledger'
import {
  guessAssetKind, listAssets, upsertAsset, findAssetLoose, archiveAsset,
  listDebts, upsertDebt, removeDebt, findDebtLoose,
  buildNetWorth, snapshotNetWorth, netWorthHistory,
} from '../src/lib/assets'

const FAKE_ID = -999005
const TZ = 'Asia/Ho_Chi_Minh'

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`) }
}

async function main() {
  const user = await getOrCreateUser(FAKE_ID, 'Thử tài sản')
  const now = new Date()

  console.log('\n── Đoán loại tài sản từ tên ──')
  check('"vàng SJC" → gold', guessAssetKind('vàng SJC').kind === 'gold')
  check('"sổ tiết kiệm VCB" → savings', guessAssetKind('sổ tiết kiệm VCB').kind === 'savings')
  check('"cổ phiếu FPT" → stock', guessAssetKind('cổ phiếu FPT').kind === 'stock')
  check('"chứng chỉ quỹ DCDS" → fund', guessAssetKind('chứng chỉ quỹ DCDS').kind === 'fund')
  check('"bitcoin" → crypto', guessAssetKind('bitcoin').kind === 'crypto')
  check('"đất Long An" → realestate', guessAssetKind('đất Long An').kind === 'realestate')
  check('"cái gì đó lạ" → other', guessAssetKind('cái gì đó lạ').kind === 'other')

  console.log('\n── Thêm tài sản ──')
  await upsertAsset(user.id, 'Vàng SJC', new Decimal(50_000_000), now, TZ, new Decimal(42_000_000))
  await upsertAsset(user.id, 'Cổ phiếu FPT', new Decimal(120_000_000), now, TZ, new Decimal(100_000_000))
  await upsertAsset(user.id, 'Sổ tiết kiệm', new Decimal(200_000_000), now, TZ)
  {
    const rows = await listAssets(user.id)
    check('có 3 tài sản', rows.length === 3, `nhận được ${rows.length}`)
    check('xếp theo giá trị giảm dần', rows[0]?.name === 'Sổ tiết kiệm')
    check('tổng đúng 370tr',
      rows.reduce((s, a) => s.plus(a.value), new Decimal(0)).toString() === '370000000')
  }

  console.log('\n── Lãi lỗ so với giá vốn ──')
  {
    const rows = await listAssets(user.id)
    const gold = rows.find((a) => a.name === 'Vàng SJC')
    check('vàng lãi 8tr', gold?.gain?.toString() === '8000000', `nhận được ${gold?.gain}`)
    check('  tức 19,0%', gold?.gainPercent?.toFixed(1) === '19.0', `nhận được ${gold?.gainPercent?.toFixed(1)}`)
    const savings = rows.find((a) => a.name === 'Sổ tiết kiệm')
    check('chưa khai giá vốn → không tính lãi lỗ', savings?.gain === null)
  }

  console.log('\n── Cập nhật giá trị: giữ lịch sử, không đè ──')
  {
    await upsertAsset(user.id, 'vang sjc', new Decimal(55_000_000), now, TZ)
    const rows = await listAssets(user.id)
    check('tìm được bằng tên không dấu', rows.length === 3, 'không được tạo thêm bản mới')
    const gold = rows.find((a) => a.name === 'Vàng SJC')
    check('giá trị đã cập nhật lên 55tr', gold?.value.toString() === '55000000',
      `nhận được ${gold?.value}`)
    check('giá vốn giữ nguyên 42tr', gold?.costBasis?.toString() === '42000000')
  }

  console.log('\n── Nợ: xếp theo lãi suất giảm dần ──')
  await upsertDebt(user.id, 'Vay mua xe', new Decimal(150_000_000), new Decimal(11))
  await upsertDebt(user.id, 'Thẻ tín dụng', new Decimal(20_000_000), new Decimal(24))
  await upsertDebt(user.id, 'Vay người thân', new Decimal(30_000_000), new Decimal(0))
  {
    const rows = await listDebts(user.id)
    check('có 3 khoản nợ', rows.length === 3)
    check('lãi cao nhất xếp đầu', rows[0]?.name === 'Thẻ tín dụng',
      `nhận được ${rows[0]?.name}`)
    check('lãi 0% xếp cuối', rows[2]?.name === 'Vay người thân')
    // 20tr x 24% / 12 = 400.000
    check('tiền lãi thẻ 400.000/tháng', rows[0]?.monthlyInterest.toFixed(0) === '400000',
      `nhận được ${rows[0]?.monthlyInterest.toFixed(0)}`)
  }

  console.log('\n── Giá trị tài sản ròng ──')
  await setAccountBalance(user.id, new Decimal(80_000_000))
  {
    const nw = await buildNetWorth(user.id)
    // lỏng 80tr + đầu tư (55 + 120 + 200 = 375tr) − nợ 200tr = 255tr
    check('tiền lỏng 80tr', nw.liquid.toString() === '80000000')
    check('đầu tư 375tr', nw.invested.toString() === '375000000', `nhận được ${nw.invested}`)
    check('nợ 200tr', nw.debt.toString() === '200000000')
    check('tài sản ròng 255tr', nw.total.toString() === '255000000', `nhận được ${nw.total}`)
    console.log(`        ${formatVnd(nw.total)}`)

    const alloc = new Map(nw.allocation.map((a) => [a.kind, a]))
    // Phan bo tinh tren 455tr (long + dau tu), khong tru no
    check('tiết kiệm chiếm 44%', alloc.get('savings')?.percent.toFixed(0) === '44',
      `nhận được ${alloc.get('savings')?.percent.toFixed(0)}`)
    check('tiền mặt chiếm 18%', alloc.get('cash')?.percent.toFixed(0) === '18',
      `nhận được ${alloc.get('cash')?.percent.toFixed(0)}`)
    check('tổng phân bổ đúng 100%',
      nw.allocation.reduce((s, a) => s.plus(a.percent), new Decimal(0)).toFixed(0) === '100')
  }

  console.log('\n── Chụp ảnh theo thời gian ──')
  {
    await snapshotNetWorth(user.id, now, TZ)
    const hist = await netWorthHistory(user.id)
    check('có 1 mốc lịch sử', hist.length === 1, `nhận được ${hist.length}`)
    check('  ghi đúng tổng', hist[0]?.total === '255000000.00', `nhận được ${hist[0]?.total}`)

    // Chup lai cung ngay khong duoc sinh them dong
    await snapshotNetWorth(user.id, now, TZ)
    const hist2 = await netWorthHistory(user.id)
    check('chụp lại cùng ngày → vẫn 1 mốc', hist2.length === 1, `nhận được ${hist2.length}`)

    // Chup ngay hom sau -> them mot moc, va so sanh duoc
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000)
    await upsertAsset(user.id, 'Vàng SJC', new Decimal(60_000_000), tomorrow, TZ)
    await snapshotNetWorth(user.id, tomorrow, TZ)
    const hist3 = await netWorthHistory(user.id)
    check('ngày hôm sau → 2 mốc', hist3.length === 2, `nhận được ${hist3.length}`)
    check('  tổng mới tăng 5tr', hist3[0]?.total === '260000000.00', `nhận được ${hist3[0]?.total}`)

    const nw = await buildNetWorth(user.id)
    check('so sánh được với mốc trước', nw.previous !== null)
  }

  console.log('\n── Tài sản ròng âm ──')
  {
    await upsertDebt(user.id, 'Vay lớn', new Decimal(500_000_000), new Decimal(9))
    const nw = await buildNetWorth(user.id)
    check('tổng âm khi nợ vượt tài sản', nw.total.lt(0), `nhận được ${nw.total}`)
    await removeDebt(user.id, (await findDebtLoose(user.id, 'Vay lớn'))!.id)
  }

  console.log('\n── Xoá tài sản ──')
  {
    const gold = await findAssetLoose(user.id, 'vàng')
    await archiveAsset(user.id, gold!.id)
    const rows = await listAssets(user.id)
    check('còn 2 tài sản', rows.length === 2, `nhận được ${rows.length}`)
    check('không còn vàng trong danh sách', !rows.some((a) => a.name === 'Vàng SJC'))
  }

  console.log('\n── Dọn dẹp ──')
  await db.delete(schema.users).where(eq(schema.users.id, user.id))
  check('đã xoá sạch', !(await db.query.users.findFirst({
    where: eq(schema.users.telegramId, FAKE_ID),
  })))

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Đạt: ${pass}   Hỏng: ${fail}`)
  console.log(`${'─'.repeat(50)}\n`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('\n❌ HỎNG:', e.message)
  try {
    await db.delete(schema.users).where(eq(schema.users.telegramId, FAKE_ID))
    console.error('   (đã dọn dữ liệu thử)')
  } catch { /* bo qua */ }
  process.exit(1)
})
