'use client'
// Count of unpaid payment links, shown next to "Balances" in BOTH admin sidebars
// (AdminShell + the dashboard's inline sidebar — the two-sidebars gotcha).
// Renders nothing at 0 or on any error: a badge is a nudge, not a source of truth.
import { useEffect, useState } from 'react'

export default function BalancesBadge() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/balances?count=1', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && typeof d.count === 'number') setN(d.count) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  if (!n) return null
  return (
    <span style={{
      marginLeft: 'auto', background: '#d4a843', color: '#0b0b0d', borderRadius: 999,
      fontSize: 10, fontWeight: 700, padding: '1px 7px', lineHeight: '16px',
    }}>{n}</span>
  )
}
