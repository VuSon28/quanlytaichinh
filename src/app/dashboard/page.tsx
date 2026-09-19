import { cookies } from 'next/headers'
import { verifySessionToken, COOKIE_NAME } from '@/lib/dashboard-auth'
import { loadDashboard } from '@/lib/dashboard-data'
import { daysInMonth, zonedParts } from '@/lib/time'
import { db, schema } from '@/db'
import { eq } from 'drizzle-orm'
import {
  StatTile, NetWorthChart, CashFlowChart, CategoryBars, BudgetMeters,
} from './charts'
import { vnd, short } from '@/lib/format'
import './dashboard.css'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const jar = await cookies()
  const userId = verifySessionToken(jar.get(COOKIE_NAME)?.value)

  if (!userId) {
    return (
      <main className="page locked">
        <h1>FinBot</h1>
        <p>Trang này cần đăng nhập.</p>
        <p className="muted">
          Mở Telegram, nhắn <code>/web</code> cho bot để lấy link vào.
        </p>
      </main>
    )
  }

  const d = await loadDashboard(userId)
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
  const tz = user?.timezone ?? 'Asia/Ho_Chi_Minh'
  const now = new Date()
  const daysLeft = daysInMonth(now, tz) - zonedParts(now, tz).day

  const nwTone = d.netWorth.total.lt(0) ? 'critical' : undefined
  const srTone = d.savingsRate
    ? (d.savingsRate.lt(10) ? 'critical' : d.savingsRate.lt(20) ? 'warning' : 'good')
    : undefined
  const efTone = d.emergencyMonths
    ? (d.emergencyMonths.lt(1) ? 'critical' : d.emergencyMonths.lt(3) ? 'warning' : 'good')
    : undefined

  return (
    <main className="page">
      <header className="head">
        <div>
          <h1>FinBot</h1>
          <p className="muted">
            {d.displayName ? `${d.displayName} · ` : ''}{d.periodLabel}
          </p>
        </div>
      </header>

      <section className="tiles">
        <StatTile
          label="Tài sản ròng"
          value={vnd(d.netWorth.total.toNumber())}
          sub={d.netWorth.debt.gt(0) ? `đã trừ nợ ${short(d.netWorth.debt.toNumber())}` : undefined}
          tone={nwTone}
        />
        <StatTile
          label="Tỷ lệ tiết kiệm"
          value={d.savingsRate ? `${d.savingsRate.toFixed(0)}%` : '—'}
          sub={d.savingsRate ? 'mốc lành mạnh: 20%' : 'cần khai /thunhap'}
          tone={srTone}
        />
        <StatTile
          label="Quỹ khẩn cấp"
          value={d.emergencyMonths ? `${d.emergencyMonths.toFixed(1)} tháng` : '—'}
          sub={d.emergencyMonths ? 'mốc an toàn: 3–6 tháng' : 'cần khai /sodu'}
          tone={efTone}
        />
        <StatTile
          label="Chi tháng này"
          value={vnd(d.monthExpense.toNumber())}
          sub={d.monthIncome.gt(0) ? `thu ${short(d.monthIncome.toNumber())}` : undefined}
        />
      </section>

      <section className="card">
        <h2>Giá trị tài sản ròng</h2>
        <NetWorthChart
          points={d.netWorthHistory.map((h) => ({
            label: h.takenOn.slice(5).replace('-', '/'),
            value: h.total.toNumber(),
          }))}
        />
      </section>

      <section className="card">
        <h2>Thu chi 12 tháng</h2>
        <CashFlowChart
          months={d.flows.map((f) => ({
            label: f.label,
            income: f.income.toNumber(),
            expense: f.expense.toNumber(),
          }))}
        />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Chi theo danh mục</h2>
          <p className="muted small">{d.periodLabel}</p>
          <CategoryBars
            rows={d.byCategory.map((c) => ({
              name: c.name,
              icon: c.icon,
              total: c.total.toNumber(),
              percent: c.percent.toNumber(),
            }))}
          />
        </section>

        <section className="card">
          <h2>Ngân sách</h2>
          <p className="muted small">còn {daysLeft} ngày</p>
          <BudgetMeters
            daysLeft={daysLeft}
            rows={d.budgets.map((b) => ({
              name: b.categoryName,
              icon: b.icon,
              used: b.used.toNumber(),
              spent: b.spent.toNumber(),
              amount: b.amount.toNumber(),
              remaining: b.remaining.toNumber(),
            }))}
          />
        </section>
      </div>

      {d.insights.length > 0 && (
        <section className="card">
          <h2>Nhận định</h2>
          <ul className="insights">
            {d.insights.map((i) => (
              <li key={i.code} className={`sev-${i.severity}`}>
                <div className="insight-title">
                  {i.severity === 3 ? '🔴' : i.severity === 2 ? '🟡' : '🟢'} {i.title}
                </div>
                <p>{i.body}</p>
                {i.action && <p className="insight-action">→ {i.action.replace(/`/g, '')}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Bang so lieu tho - de doc duoc khi khong nhin duoc bieu do */}
      <details className="card">
        <summary>Xem dạng bảng</summary>
        <table className="data-table">
          <thead>
            <tr><th>Tháng</th><th>Thu</th><th>Chi</th><th>Chênh lệch</th></tr>
          </thead>
          <tbody>
            {d.flows.map((f) => (
              <tr key={f.month}>
                <td>{f.month}</td>
                <td>{vnd(f.income.toNumber())}</td>
                <td>{vnd(f.expense.toNumber())}</td>
                <td className={f.net.lt(0) ? 'tone-critical' : undefined}>
                  {vnd(f.net.toNumber())}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <footer className="foot muted small">
        Số liệu tính trực tiếp từ sổ của bạn. Cập nhật qua Telegram.
      </footer>
    </main>
  )
}
