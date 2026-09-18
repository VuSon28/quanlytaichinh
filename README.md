# FinBot — Quản lý tài chính cá nhân qua Telegram

Bot ghi chi tiêu bằng tiếng Việt tự nhiên, phân tích sức khỏe tài chính, chạy trên Vercel với chi phí gần bằng không.

## Nguyên tắc thiết kế

**1. AI không tính toán.** Mọi con số — tỷ lệ tiết kiệm, số tháng quỹ khẩn cấp, chi phí trung bình — do code tính từ database. AI chỉ được đọc kết quả đã tính rồi diễn giải. Đây là nguồn sai số lớn nhất của các bot tài chính khác.

**2. Luật trước, AI sau.** Câu `cafe 45k` được xử lý bằng biểu thức chính quy và từ điển, mất vài mili giây và không tốn tiền. AI chỉ vào cuộc cho ảnh hóa đơn, tin nhắn thoại và câu hỏi tự do.

**3. Bot học thói quen của bạn.** Gặp từ lạ, bot hỏi một lần rồi ghi vào bảng `keyword_map`. Sau vài tuần, gần như mọi giao dịch được nhận diện với chi phí 0đ — và khớp đúng cách bạn gọi tên sự việc, không phải cách từ điển giả định.

**4. Phân loại theo sức khỏe tài chính, không theo chủ đề.** Mỗi danh mục mang nhãn `essential` / `flexible` / `saving`. Nhờ đó bot trả lời được câu hỏi thật sự quan trọng: *nếu mất thu nhập, tôi sống được mấy tháng?*

## Trạng thái

| Giai đoạn | Nội dung | Tình trạng |
|---|---|---|
| 0 | Khung dự án, schema database | ✅ Xong |
| 1 | Bot ghi chi tiêu bằng text, tự phân loại, tự học | ✅ Xong |
| 2 | Ảnh hóa đơn + tin nhắn thoại | ⬜ Chưa |
| 3 | Ngân sách, cảnh báo, báo cáo chủ động | ⬜ Chưa |
| 4 | Import sao kê ngân hàng | ⬜ Chưa |
| 5 | Đầu tư & tích sản, net worth | ⬜ Chưa |
| 6 | Web dashboard | ⬜ Chưa |

## Cài đặt

### 1. Tạo tài khoản

| Dịch vụ | Lấy gì | Ở đâu |
|---|---|---|
| Supabase | `DATABASE_URL` (chọn **Transaction pooler**) | [supabase.com](https://supabase.com) |
| Telegram | `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` |
| Telegram | `OWNER_TELEGRAM_ID` | [@userinfobot](https://t.me/userinfobot) |
| Anthropic | `ANTHROPIC_API_KEY` (cho giai đoạn 2+) | [console.anthropic.com](https://console.anthropic.com) |
| Vercel | — | [vercel.com](https://vercel.com) |

### 2. Cấu hình

```bash
cp .env.example .env.local
# Mở .env.local và điền các giá trị
```

Tự sinh hai chuỗi bí mật:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Chạy hai lần, dùng cho `TELEGRAM_WEBHOOK_SECRET` và `CRON_SECRET`.

### 3. Tạo bảng trong database

```bash
npm install
npm run db:push
```

### 4. Chạy thử ở máy

```bash
npx tsx scripts/test-parser.ts   # kiểm tra bộ đọc tiếng Việt
npm run dev
```

### 5. Deploy

```bash
git init && git add -A && git commit -m "khoi tao finbot"
# Đẩy lên GitHub, rồi Import project ở vercel.com
```

Vào Vercel → Project → **Settings → Environment Variables**, thêm toàn bộ biến trong `.env.local`.

Sau khi deploy xong, trỏ webhook về ứng dụng:

```bash
npx tsx scripts/set-webhook.ts https://ten-app-cua-ban.vercel.app
```

Nhắn `/start` cho bot để bắt đầu.

## Cách dùng

```
cafe 45k              → Ăn ngoài & cà phê, 45.000đ
đổ xăng 80k           → Đi lại, 80.000đ
ăn trưa 55 nghìn      → Ăn uống thiết yếu, 55.000đ
tiền điện 450k        → Điện nước internet, 450.000đ
gửi tiết kiệm 5tr     → Tiết kiệm, 5.000.000đ
+20tr lương           → Thu nhập: Lương, 20.000.000đ
```

Cách viết số tiền bot hiểu: `45k` · `45n` · `45 nghìn` · `45.000` · `1tr` · `1tr2` · `1,5tr` · `2ty5`. Số trần dưới 1000 được hiểu là nghìn (`cafe 45` = 45.000đ).

| Lệnh | Việc |
|---|---|
| `/homnay` | Chi tiêu hôm nay |
| `/thang` | Tổng kết tháng này |
| `/gannhat` | 10 giao dịch gần nhất |
| `/xoa` | Xoá giao dịch vừa ghi |
| `/xoa 123` | Xoá giao dịch số 123 |

## Bảo mật

- Bot chỉ trả lời `OWNER_TELEGRAM_ID`, mọi người khác bị từ chối ở middleware đầu tiên.
- Webhook xác minh header `x-telegram-bot-api-secret-token` trước khi xử lý.
- `.env.local` nằm trong `.gitignore` — đừng bao giờ commit.
- Toàn bộ số tiền lưu kiểu `numeric`, xử lý bằng `decimal.js`. Không dùng số thực cho tiền ở bất kỳ đâu.

## Chi phí vận hành

| Khoản | Mức |
|---|---|
| Vercel Hobby | 0đ |
| Supabase free (500 MB) | 0đ |
| Telegram API | 0đ |
| Giai đoạn 1 (không gọi AI) | **0đ** |
| Giai đoạn 2+ (Claude Haiku cho OCR/voice/tư vấn) | ~15–25k/tháng |
