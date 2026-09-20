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
| 3 | Ngân sách, cảnh báo, báo cáo chủ động | ✅ Xong |
| 4 | Import sao kê ngân hàng | ✅ Xong |
| 5 | Đầu tư & tích sản, net worth | ✅ Xong |
| 6 | Web dashboard | ✅ Xong |
| 7 | Trò chuyện tự nhiên bằng Claude | ✅ Xong |

## Cài đặt

### 1. Tạo tài khoản

| Dịch vụ | Lấy gì | Ở đâu |
|---|---|---|
| Supabase | `DATABASE_URL` (chọn **Transaction pooler**) | [supabase.com](https://supabase.com) |
| Telegram | `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` |
| Telegram | `OWNER_TELEGRAM_ID` | [@userinfobot](https://t.me/userinfobot) |
| Anthropic | `ANTHROPIC_API_KEY` (để bot trò chuyện được) | [console.anthropic.com](https://console.anthropic.com) |
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
npm run db:migrate:chat   # bảng lưu mạch trò chuyện
```

### 4. Chạy thử ở máy

```bash
npm test          # toàn bộ kiểm thử, chạy offline, không tốn tiền
npm run bot       # chạy bot ngay trên máy, không cần deploy
npm run chat      # thử một lượt trò chuyện thật (cần ANTHROPIC_API_KEY)
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
| `/quen` | Quên mạch trò chuyện, bắt đầu lại |

### Trò chuyện

Có `ANTHROPIC_API_KEY` thì bot không chỉ ghi chép nữa — cứ nhắn như nhắn cho bạn bè:

```
tháng này tôi tiêu nhiều quá phải không?
còn bao nhiêu tiền ăn ngoài nữa?
có nên mua xe 500 triệu không?
mệt quá, tháng này tiêu hoang thật sự
```

Bot nhớ được mạch câu chuyện trong 12 tiếng, nên hỏi tiếp "thế còn tháng trước?" là nó hiểu.

Ba điều đáng nói về cách phần này được xây:

- **Bộ luật vẫn đi trước.** `cafe 45k` không bao giờ chạm tới AI — ghi trong vài mili giây, không tốn một đồng. Chỉ những câu *nghe như đang trò chuyện* mới được chuyển sang Claude.
- **Định tuyến chặn trước khi ghi.** "Có nên mua xe 500 triệu không?" có chứa một số tiền hợp lệ. Nếu để bộ luật xử lý, bạn vừa bị ghi một khoản chi 500 triệu chỉ vì hỏi một câu. Xem `looksLikeChat()` trong [src/lib/ai.ts](src/lib/ai.ts).
- **AI không được bịa số.** Nó không đọc thẳng database. Mọi con số phải đi qua một trong chín công cụ đọc/ghi sổ — không có công cụ thì nó không biết, và phải nói là không biết.

### Tra giá thị trường

Bot tra web được giá vàng SJC, tỷ giá, giá cổ phiếu, lãi suất:

```
giá vàng SJC hôm nay bao nhiêu?
tỷ giá USD thế nào rồi?
```

Nó luôn kèm mốc thời gian và nguồn — một con số giá vàng không có mốc thời gian là vô dụng.

Tìm kiếm **đắt hơn hẳn** một câu trò chuyện thường (~0,01 USD mỗi lần), nên có hai cái phanh: tối đa 2 lần tìm cho mỗi câu, và câu hỏi về sổ sách thì không bao giờ tra web. Tắt hẳn bằng `FINBOT_WEB_SEARCH=off`.

### Biến môi trường

| Biến | Mặc định | Việc |
|---|---|---|
| `FINBOT_AI_MODEL` | `claude-opus-5` | Model dùng cho trò chuyện |
| `FINBOT_AI_EFFORT` | `low` | Độ sâu suy nghĩ (dòng Haiku không nhận) |
| `FINBOT_WEB_SEARCH` | bật | Đặt `off` để tắt tra web |
| `FINBOT_WEB_SEARCH_MAX` | `2` | Số lần tìm tối đa mỗi câu |

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
| Ghi chép bằng bộ luật (không gọi AI) | **0đ** |
| Trò chuyện qua Claude | tính theo lượt nhắn, xem [pricing](https://www.anthropic.com/pricing) |
| Mỗi lần tra giá thị trường | ~0,01 USD |

Phần ghi chép hằng ngày — thứ bạn dùng nhiều nhất — vẫn miễn phí tuyệt đối. Chỉ những câu hỏi thật sự mới tốn tiền. Muốn rẻ hơn nữa thì đặt `FINBOT_AI_MODEL=claude-haiku-4-5`.
