'use client'
import { useState } from 'react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WD = ['S','M','T','W','T','F','S']

function parseYMD(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const navBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: '0 10px', lineHeight: 1 }

// Custom dark date picker — fully width-constrained (no native-input overflow,
// no OS picker popup spilling off-screen). In-flow calendar (pushes content down).
export default function DatePicker({ value, min, onChange }: { value: string; min?: string; onChange: (d: string) => void }) {
  const selected = parseYMD(value)
  const minDate  = min ? parseYMD(min) : null
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => selected ?? new Date())

  const y = view.getFullYear()
  const m = view.getMonth()
  const firstWeekday = new Date(y, m, 1).getDay()
  const daysInMonth  = new Date(y, m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const minStripped = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null
  const isDisabled = (day: number) => minStripped ? new Date(y, m, day) < minStripped : false
  const isSelected = (day: number) => !!selected && selected.getFullYear() === y && selected.getMonth() === m && selected.getDate() === day

  const label = selected ? `${MONTHS[selected.getMonth()].slice(0, 3)} ${selected.getDate()}, ${selected.getFullYear()}` : 'Select a date'

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '16px 20px', fontSize: 16, fontFamily: '"Inter Tight", Inter, sans-serif', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, width: '100%', maxWidth: 380, boxSizing: 'border-box', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={() => setView(new Date(y, m - 1, 1))} style={navBtn}>‹</button>
            <span style={{ fontFamily: '"Inter Tight", Inter, sans-serif', fontSize: 14, fontWeight: 500, letterSpacing: '0.04em' }}>{MONTHS[m]} {y}</span>
            <button type="button" onClick={() => setView(new Date(y, m + 1, 1))} style={navBtn}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {WD.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '4px 0', fontFamily: '"JetBrains Mono", monospace' }}>{d}</div>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => day === null ? <div key={i} /> : (
              <button key={i} type="button" disabled={isDisabled(day)}
                onClick={() => { onChange(toYMD(new Date(y, m, day))); setOpen(false) }}
                style={{
                  aspectRatio: '1', border: 'none', borderRadius: 2, cursor: isDisabled(day) ? 'default' : 'pointer',
                  fontSize: 13, fontFamily: '"Inter Tight", Inter, sans-serif',
                  background: isSelected(day) ? '#fff' : 'transparent',
                  color: isSelected(day) ? '#080808' : (isDisabled(day) ? 'rgba(255,255,255,0.18)' : '#fff'),
                }}>
                {day}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
