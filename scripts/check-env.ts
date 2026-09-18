/**
 * Kiem tra file .env.local da dien dung chua.
 * Chay: npx tsx scripts/check-env.ts
 *
 * Script nay KHONG in ra gia tri that cua bat ky bi mat nao - chi in do
 * dai va vai ky tu dau/cuoi de ban doi chieu. Token that khong bao gio
 * xuat hien tren man hinh hay trong log.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export {}

const envPath = resolve(process.cwd(), '.env.local')

if (!existsSync(envPath)) {
  console.error('❌ Không tìm thấy .env.local')
  process.exit(1)
}

/* Doc file .env don gian - khong can thu vien ngoai */
const env: Record<string, string> = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
  if (!m) continue
  env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

function mask(v: string): string {
  if (v.length <= 8) return '*'.repeat(v.length)
  return `${v.slice(0, 4)}${'*'.repeat(Math.min(v.length - 8, 20))}${v.slice(-4)}`
}

let problems = 0

function check(
  key: string,
  opts: { required: boolean; validate?: (v: string) => string | null },
) {
  const v = env[key] ?? ''
  if (!v) {
    if (opts.required) {
      console.log(`  ❌ ${key} — còn trống`)
      problems++
    } else {
      console.log(`  ⚪ ${key} — trống (chưa cần ở giai đoạn 1)`)
    }
    return
  }
  const err = opts.validate?.(v)
  if (err) {
    console.log(`  ❌ ${key} — ${err}`)
    problems++
    return
  }
  console.log(`  ✅ ${key} — ${mask(v)}  (${v.length} ký tự)`)
}

console.log('\n── Kiểm tra .env.local ──\n')

check('DATABASE_URL', {
  required: true,
  validate: (v) => {
    if (!v.startsWith('postgres://') && !v.startsWith('postgresql://')) {
      return 'phải bắt đầu bằng postgresql://'
    }
    if (v.includes('[YOUR-PASSWORD]') || v.includes('[PASSWORD]')) {
      return 'chưa thay [YOUR-PASSWORD] bằng mật khẩu database thật'
    }
    if (!v.includes('pooler.supabase.com')) {
      return 'phải là chuỗi Transaction pooler (có pooler.supabase.com), không phải Direct connection'
    }
    if (!v.includes(':6543/')) {
      return 'sai cổng — Transaction pooler dùng cổng 6543, không phải 5432'
    }
    /**
     * Bay pho bien nhat: mat khau chua ky tu cau truc cua URL.
     * "@" trong mat khau lam chuoi bi cat sai cho -> loi ket noi rat kho
     * doan, vi thong bao chi noi "khong tim thay host".
     */
    const afterScheme = v.slice(v.indexOf('://') + 3)
    if ((afterScheme.match(/@/g) ?? []).length > 1) {
      return 'mật khẩu chứa ký tự @ chưa mã hoá — thay @ bằng %40 trong phần mật khẩu'
    }
    for (const [ch, enc] of [['/', '%2F'], ['?', '%3F'], ['#', '%23']] as const) {
      const pwd = afterScheme.slice(afterScheme.indexOf(':') + 1, afterScheme.lastIndexOf('@'))
      if (pwd.includes(ch)) return `mật khẩu chứa ký tự ${ch} chưa mã hoá — thay bằng ${enc}`
    }
    return null
  },
})

check('TELEGRAM_BOT_TOKEN', {
  required: true,
  validate: (v) => (/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(v)
    ? null
    : 'sai định dạng, phải là dạng 8123456789:AAH...'),
})

check('TELEGRAM_WEBHOOK_SECRET', {
  required: true,
  validate: (v) => (v.length >= 16 ? null : 'quá ngắn, nên từ 16 ký tự trở lên'),
})

check('OWNER_TELEGRAM_ID', {
  required: true,
  validate: (v) => (/^\d+$/.test(v) ? null : 'phải là số, không có chữ hay @'),
})

check('ANTHROPIC_API_KEY', { required: false })
check('CRON_SECRET', { required: false })

/* ------------------------------------------------------------------ *
 * Goi that len Telegram de xac nhan token song
 * ------------------------------------------------------------------ */

async function pingTelegram() {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token || !/^\d{6,}:/.test(token)) return

  console.log('\n── Hỏi Telegram xem token có thật không ──\n')
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const json = (await res.json()) as {
      ok: boolean
      description?: string
      result?: { id: number; username: string; first_name: string }
    }
    if (json.ok && json.result) {
      console.log(`  ✅ Bot sống: @${json.result.username} ("${json.result.first_name}")`)
      const owner = env.OWNER_TELEGRAM_ID
      if (owner && String(json.result.id) === owner) {
        console.log(
          '  ⚠️  OWNER_TELEGRAM_ID đang bằng id của BOT.\n' +
          '      Phải là id TÀI KHOẢN CỦA BẠN (lấy từ @userinfobot), không phải của bot.',
        )
        problems++
      }
    } else {
      console.log(`  ❌ Telegram từ chối token: ${json.description}`)
      problems++
    }
  } catch (e) {
    console.log(`  ⚠️  Không gọi được Telegram (mạng?): ${(e as Error).message}`)
  }
}

pingTelegram().then(() => {
  console.log(`\n${'─'.repeat(50)}`)
  if (problems === 0) {
    console.log('Tất cả hợp lệ. Bước tiếp theo: npm run db:push')
  } else {
    console.log(`Còn ${problems} mục cần sửa.`)
  }
  console.log(`${'─'.repeat(50)}\n`)
  process.exit(problems > 0 ? 1 : 0)
})
