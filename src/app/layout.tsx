import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FinBot',
  description: 'Quản lý tài chính cá nhân',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
