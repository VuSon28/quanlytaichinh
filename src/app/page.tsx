import Link from 'next/link'

/**
 * Trang chu. Khong hien so lieu gi - du lieu tai chinh nam sau lop dang
 * nhap o /dashboard. Trang nay chi de nguoi go nham dia chi biet minh
 * dang o dau va phai di dau tiep.
 */
export default function Home() {
  return (
    <main style={{
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      lineHeight: 1.6,
      margin: '0 auto',
      maxWidth: 560,
      padding: '64px 24px',
    }}>
      <h1 style={{ fontSize: '1.75rem', letterSpacing: '-0.02em', margin: 0 }}>
        FinBot
      </h1>
      <p style={{ color: '#52514e', marginTop: 4 }}>
        Quản lý tài chính cá nhân qua Telegram
      </p>

      <p style={{ marginTop: 32 }}>
        <Link href="/dashboard" style={{ color: '#2a78d6', fontWeight: 600 }}>
          Mở dashboard →
        </Link>
      </p>

      <p style={{ color: '#898781', fontSize: '0.9rem', marginTop: 24 }}>
        Dashboard cần đăng nhập. Mở Telegram, nhắn{' '}
        <code style={{ background: '#f0efec', borderRadius: 4, padding: '1px 5px' }}>
          /web
        </code>{' '}
        cho bot để lấy link vào.
      </p>
    </main>
  )
}
