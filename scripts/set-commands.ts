/**
 * Dang ky danh sach lenh voi Telegram.
 * Chay: npm run setcommands
 *
 * Sau khi chay, o Telegram se hien nut menu canh o soan tin, va go dau
 * "/" la ra danh sach goi y kem mo ta. Khong co buoc nay thi lenh van
 * chay binh thuong, nhung nguoi dung phai TU NHO ten lenh - va thu gi
 * phai nho thi som muon cung bi quen.
 *
 * Chay lai bat cu luc nao sau khi them lenh moi; Telegram ghi de toan bo
 * danh sach cu.
 */
import { Bot } from 'grammy'

export {}

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('Thiếu TELEGRAM_BOT_TOKEN')
  process.exit(1)
}

/**
 * Xep theo tan suat dung, khong theo nhom chuc nang.
 *
 * Menu cua Telegram khong co tieu de nhom, nen thu tu la thu duy nhat
 * dan mat nguoi dung. Viec lam nhieu nhat phai nam tren cung.
 */
const COMMANDS = [
  { command: 'homnay', description: '📅 Chi tiêu hôm nay' },
  { command: 'thang', description: '📊 Tổng kết tháng này' },
  { command: 'gannhat', description: '🧾 10 giao dịch gần nhất' },
  { command: 'xoa', description: '🗑 Xoá giao dịch vừa ghi' },

  { command: 'ngansach', description: '🎯 Ngân sách — /ngansach Ăn ngoài 3tr' },
  { command: 'danhgia', description: '💡 Nhận định & lời khuyên tài chính' },

  { command: 'thunhap', description: '💰 Khai thu nhập tháng — /thunhap 25tr' },
  { command: 'sodu', description: '👛 Khai số dư hiện có — /sodu 30tr' },

  { command: 'taisan', description: '🥇 Tài sản — /taisan vàng 50tr' },
  { command: 'no', description: '💳 Nợ — /no thẻ tín dụng 20tr 24%' },
  { command: 'taisanrong', description: '📈 Giá trị tài sản ròng' },

  { command: 'quen', description: '🧹 Quên mạch trò chuyện, bắt đầu lại' },

  { command: 'web', description: '🖥 Mở dashboard có biểu đồ' },
  { command: 'start', description: '❓ Hướng dẫn sử dụng' },
]

async function main() {
  const bot = new Bot(token!)

  await bot.api.setMyCommands(COMMANDS)

  // Nut canh o soan tin mo ra danh sach lenh
  await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } })

  const saved = await bot.api.getMyCommands()
  console.log(`✅ Đã đăng ký ${saved.length} lệnh với Telegram:\n`)
  for (const c of saved) {
    console.log(`   /${c.command.padEnd(12)} ${c.description}`)
  }
  console.log(
    '\nMở Telegram, gõ "/" trong khung chat với bot là thấy danh sách.\n' +
    'Nếu chưa thấy ngay, đóng và mở lại cuộc trò chuyện — Telegram nhớ đệm vài phút.',
  )
}

main().catch((e) => {
  console.error('❌ Thất bại:', e.message)
  process.exit(1)
})
