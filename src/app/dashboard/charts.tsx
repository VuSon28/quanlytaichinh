'use client'

import { useState } from 'react'
import { short, vnd } from '@/lib/format'

/**
 * Bieu do ve bang SVG viet tay, khong dung thu vien.
 *
 * Ly do: bo du lieu o day rat nho (12 thang, vai chuc danh muc), trong
 * khi mot thu vien bieu do keo theo hang tram KB javascript va mot lop
 * truu tuong phai hoc. SVG truc tiep cho kiem soat tung chi tiet - do
 * day net, khoang ho giua cac cot, vi tri nhan - va do chinh la nhung
 * thu quyet dinh bieu do co doc duoc hay khong.
 *
 * Mau lay tu bang mau da qua kiem dinh mu mau va do tuong phan. Hai mau
 * chuoi so lieu la xanh duong va cam - KHONG dung xanh la / do cho
 * thu / chi, vi hai mau do danh rieng cho trang thai (tot / nguy hiem)
 * va dung lai se lam nguoi doc hieu nham.
 */


/* ------------------------------------------------------------------ *
 * O so lieu noi bat
 * ------------------------------------------------------------------ */

export function StatTile({
  label, value, sub, tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'warning' | 'critical'
}) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value${tone ? ` tone-${tone}` : ''}`}>{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Duong gia tri tai san rong
 * ------------------------------------------------------------------ */

export function NetWorthChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const [hover, setHover] = useState<number | null>(null)

  if (points.length < 2) {
    return (
      <p className="empty">
        Cần ít nhất 2 mốc thời gian mới vẽ được đường tăng trưởng.
        Nhắn <code>/taisanrong</code> cho bot để chụp mốc hôm nay.
      </p>
    )
  }

  const W = 800
  const H = 240
  const PAD = { top: 16, right: 16, bottom: 28, left: 56 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const values = points.map((p) => p.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values)
  const span = max - min || 1

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW
  const y = (v: number) => PAD.top + plotH - ((v - min) / span) * plotH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`

  const ticks = [min, min + span / 2, max]
  const active = hover ?? points.length - 1

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
        aria-label="Giá trị tài sản ròng theo thời gian">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 8} y={y(t) + 4} className="axis-label" textAnchor="end">
              {short(t)}
            </text>
          </g>
        ))}

        <path d={area} className="area-1" />
        <path d={line} className="line-1" />

        {/* Cham dau cuoi de mat bam duoc diem bat dau va hien tai */}
        {points.map((p, i) => (
          (i === 0 || i === points.length - 1 || i === hover) && (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={i === hover ? 6 : 4}
              className="dot-1" />
          )
        ))}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH}
            className="crosshair" />
        )}

        {/*
          Vung bat chuot rong hon diem ve, de khong phai nham chinh xac.
          Cat gon trong long bieu do: neu de tran ra, o dau tien se phu
          len nhan truc va nuot chuot o do.
        */}
        {points.map((p, i) => {
          const halfStep = plotW / (points.length - 1) / 2
          const left = Math.max(PAD.left, x(i) - halfStep)
          const right = Math.min(PAD.left + plotW, x(i) + halfStep)
          return (
            <rect key={`hit-${i}`}
              x={left} y={PAD.top}
              width={right - left} height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}

        {points.map((p, i) => (
          (i === 0 || i === points.length - 1) && (
            <text key={`t-${i}`} x={x(i)} y={H - 8} className="axis-label"
              textAnchor={i === 0 ? 'start' : 'end'}>
              {p.label}
            </text>
          )
        ))}
      </svg>

      <div className="readout">
        <span className="swatch swatch-1" aria-hidden="true" />
        <strong>{vnd(points[active].value)}</strong>
        <span className="muted">{points[active].label}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Thu chi theo thang
 * ------------------------------------------------------------------ */

export function CashFlowChart({
  months,
}: {
  months: Array<{ label: string; income: number; expense: number }>
}) {
  const [hover, setHover] = useState<number | null>(null)

  const max = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1)
  if (max <= 1) {
    return <p className="empty">Chưa có giao dịch nào để vẽ.</p>
  }

  const W = 800
  const H = 240
  const PAD = { top: 16, right: 16, bottom: 28, left: 56 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const slot = plotW / months.length
  // Khe 2px giua hai cot cung nhom, va giua cac nhom
  const barW = Math.max(4, (slot - 10) / 2 - 1)
  const h = (v: number) => (v / max) * plotH

  const ticks = [0, max / 2, max]

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
        aria-label="Thu và chi theo từng tháng">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right}
              y1={PAD.top + plotH - h(t)} y2={PAD.top + plotH - h(t)}
              className={t === 0 ? 'baseline' : 'grid'} />
            <text x={PAD.left - 8} y={PAD.top + plotH - h(t) + 4}
              className="axis-label" textAnchor="end">{short(t)}</text>
          </g>
        ))}

        {months.map((m, i) => {
          const gx = PAD.left + i * slot + slot / 2
          return (
            <g key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH}
                fill="transparent" />
              <rect x={gx - barW - 1} y={PAD.top + plotH - h(m.income)}
                width={barW} height={h(m.income)} rx="4"
                className={`bar-1${hover === i ? ' bar-active' : ''}`} />
              <rect x={gx + 1} y={PAD.top + plotH - h(m.expense)}
                width={barW} height={h(m.expense)} rx="4"
                className={`bar-2${hover === i ? ' bar-active' : ''}`} />
              <text x={gx} y={H - 8} className="axis-label" textAnchor="middle">
                {m.label}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="legend">
        <span className="legend-item"><i className="swatch swatch-1" />Thu</span>
        <span className="legend-item"><i className="swatch swatch-2" />Chi</span>
      </div>

      {hover !== null && (
        <div className="readout">
          <strong>Tháng {months[hover].label}</strong>
          <span><i className="swatch swatch-1" />{vnd(months[hover].income)}</span>
          <span><i className="swatch swatch-2" />{vnd(months[hover].expense)}</span>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Chi tieu theo danh muc
 * ------------------------------------------------------------------ */

export function CategoryBars({
  rows,
}: {
  rows: Array<{ name: string; icon: string | null; total: number; percent: number }>
}) {
  if (!rows.length) return <p className="empty">Chưa có chi tiêu nào tháng này.</p>

  const max = Math.max(...rows.map((r) => r.total), 1)

  return (
    <ul className="hbars">
      {rows.slice(0, 10).map((r) => (
        <li key={r.name}>
          <div className="hbar-head">
            <span className="hbar-name">{r.icon ?? '•'} {r.name}</span>
            <span className="hbar-value">{short(r.total)}</span>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
          <div className="hbar-sub">{r.percent.toFixed(0)}% chi tiêu</div>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ *
 * Tien do ngan sach
 * ------------------------------------------------------------------ */

export function BudgetMeters({
  rows, daysLeft,
}: {
  rows: Array<{ name: string; icon: string | null; used: number; spent: number; amount: number; remaining: number }>
  daysLeft: number
}) {
  if (!rows.length) {
    return (
      <p className="empty">
        Chưa đặt ngân sách nào. Nhắn <code>/ngansach Ăn ngoài 3tr</code> cho bot.
      </p>
    )
  }

  return (
    <ul className="meters">
      {rows.map((r) => {
        /**
         * Mau trang thai di kem BIEU TUONG va CHU, khong bao gio dung
         * mau khong. Nguoi mu mau se khong phan biet duoc vang voi do,
         * nhung "⚠ Sắp hết" thi ai cung doc duoc.
         */
        const tone = r.used >= 100 ? 'critical' : r.used >= 80 ? 'warning' : 'good'
        const mark = tone === 'critical' ? '⛔' : tone === 'warning' ? '⚠️' : '✓'
        const state = tone === 'critical' ? 'Đã vượt' : tone === 'warning' ? 'Sắp hết' : 'Trong hạn mức'

        return (
          <li key={r.name}>
            <div className="meter-head">
              <span className="meter-name">{r.icon ?? '•'} {r.name}</span>
              <span className={`meter-state tone-${tone}`}>{mark} {state}</span>
            </div>
            <div className="meter-track">
              <div className={`meter-fill tone-${tone}`}
                style={{ width: `${Math.min(100, r.used)}%` }} />
            </div>
            <div className="meter-sub">
              {short(r.spent)} / {short(r.amount)} · {r.used.toFixed(0)}%
              {r.remaining >= 0
                ? ` · còn ${short(r.remaining)} cho ${daysLeft} ngày`
                : ` · vượt ${short(Math.abs(r.remaining))}`}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
