'use client'

import { useEffect, useState } from 'react'

const C = { bg: '#0f0f10', card: '#1a1a1c', line: '#2a2a2e', text: '#f4f4f5', dim: '#a1a1aa', accent: '#ef6354', good: '#22c55e', input: '#232327' }

type Item = { id: string; name: string; rate: number; category: string; available: number }

// Modal gear picker: add equipment to a booking and charge the card on file.
export default function GearPanel({ bookingId, label, onClose, onDone }: {
  bookingId: string; label: string; onClose: () => void; onDone: () => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [hasCard, setHasCard] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/desk/bookings/${bookingId}/add-gear`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else { setItems(d.equipment); setHasCard(d.hasCardOnFile) } })
      .catch(() => setErr('Could not load gear.'))
      .finally(() => setLoading(false))
  }, [bookingId])

  const setQty = (id: string, qty: number, max: number) => {
    const q = Math.max(0, Math.min(qty, max))
    setCart(c => { const n = { ...c }; if (q === 0) delete n[id]; else n[id] = q; return n })
  }
  const total = items.reduce((s, it) => s + it.rate * (cart[it.id] ?? 0), 0)
  const chosen = Object.keys(cart).length

  const submit = async () => {
    if (chosen === 0) return
    setBusy(true); setErr('')
    const payload = { items: Object.entries(cart).map(([equipment_id, quantity]) => ({ equipment_id, quantity })), charge: hasCard }
    const r = await fetch(`/api/desk/bookings/${bookingId}/add-gear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Could not add gear.'); return }
    alert(d.charged ? `✓ $${(d.totalCents / 100).toFixed(2)} charged and gear attached.` : `✓ Gear attached. Collect $${(d.totalCents / 100).toFixed(2)} manually.`)
    onDone(); onClose()
  }

  const cats = Array.from(new Set(items.map(i => i.category || 'Other')))
  const btn = (bg: string, on = true): React.CSSProperties => ({ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: on ? 'pointer' : 'default', background: bg, color: '#fff', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, opacity: on ? 1 : 0.5 })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 12px', zIndex: 50, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 14, width: '100%', maxWidth: 560, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <strong style={{ fontFamily: 'Anton, sans-serif', fontSize: 20 }}>ADD GEAR</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ color: C.dim, fontSize: 13, marginBottom: 14 }}>{label}</div>

        {loading && <p style={{ color: C.dim }}>Loading gear…</p>}
        {err && <p style={{ color: C.accent, fontSize: 13 }}>{err}</p>}

        {!loading && cats.map(cat => (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{cat}</div>
            {items.filter(i => (i.category || 'Other') === cat).map(it => {
              const qty = cart[it.id] ?? 0
              const out = it.available <= 0
              return (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.line}`, opacity: out ? 0.4 : 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15 }}>{it.name}</div>
                    <div style={{ color: C.dim, fontSize: 12 }}>${it.rate.toFixed(0)} · {it.available} free</div>
                  </div>
                  <button disabled={qty <= 0} onClick={() => setQty(it.id, qty - 1, it.available)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.line}`, background: C.input, color: C.text, cursor: 'pointer', fontSize: 18 }}>−</button>
                  <span style={{ minWidth: 20, textAlign: 'center' }}>{qty}</span>
                  <button disabled={out || qty >= it.available} onClick={() => setQty(it.id, qty + 1, it.available)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.line}`, background: C.input, color: C.text, cursor: 'pointer', fontSize: 18 }}>+</button>
                </div>
              )
            })}
          </div>
        ))}

        {!loading && (
          <div style={{ position: 'sticky', bottom: 0, background: C.bg, paddingTop: 12, borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>${total.toFixed(2)}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ ...btn('transparent'), border: `1px solid ${C.line}`, color: C.dim }}>Cancel</button>
              <button onClick={submit} disabled={chosen === 0 || busy} style={btn(C.accent, chosen > 0 && !busy)}>
                {busy ? 'Working…' : hasCard ? `Charge $${total.toFixed(2)} & attach` : `Attach · collect $${total.toFixed(2)}`}
              </button>
            </div>
          </div>
        )}
        {!loading && !hasCard && chosen > 0 && <p style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>No card on file — gear will be attached and you collect payment manually.</p>}
      </div>
    </div>
  )
}
