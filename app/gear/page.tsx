'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Gear {
  id: string
  name: string
  rate: number
  category: string
  quantity: number
  description: string | null
  available: number
  allow_offsite: boolean
}

interface CartLine { id: string; name: string; rate: number; quantity: number }

const CART_KEY = 'mk_gear_cart'

const CATEGORY_LABELS: Record<string, string> = {
  lighting:        'Lighting',
  modifier:        'Modifiers',
  special_effects: 'Special Effects',
  camera:          'Camera',
}
const CATEGORY_ORDER = ['lighting', 'modifier', 'special_effects', 'camera']

function loadCart(): CartLine[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] }
}
function saveCart(cart: CartLine[]) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {}
}

export default function GearPage() {
  const [gear, setGear]       = useState<Gear[]>([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart]       = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  useEffect(() => {
    setCart(loadCart())
    fetch('/api/equipment')
      .then(r => r.json())
      .then(d => setGear(d.equipment ?? []))
      .catch(() => setGear([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { saveCart(cart) }, [cart])

  const qtyInCart = (id: string) => cart.find(l => l.id === id)?.quantity ?? 0

  const addToCart = (g: Gear) => {
    setCart(prev => {
      const existing = prev.find(l => l.id === g.id)
      const cap = g.quantity || 99
      if (existing) {
        return prev.map(l => l.id === g.id ? { ...l, quantity: Math.min(cap, l.quantity + 1) } : l)
      }
      return [...prev, { id: g.id, name: g.name, rate: g.rate, quantity: 1 }]
    })
    setCartOpen(true)
  }
  const decFromCart = (id: string) =>
    setCart(prev => prev.flatMap(l => l.id === id ? (l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : []) : [l]))
  const removeLine = (id: string) => setCart(prev => prev.filter(l => l.id !== id))

  const subtotal = cart.reduce((s, l) => s + l.rate * l.quantity, 0)
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0)

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 40px', position: 'sticky', top: 0, background: 'rgba(8,8,8,0.95)', zIndex: 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>MADE<br />KULTURE</div>
        </Link>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          {(['HOME', 'SETS', 'GEAR', 'BOOK'] as const).map(item => (
            <Link key={item} href={item === 'HOME' ? '/' : `/${item.toLowerCase()}`}
              style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: item === 'GEAR' ? '#fff' : 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>{item}</Link>
          ))}
          <button onClick={() => setCartOpen(true)} style={{ position: 'relative', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.12em' }}>
            CART{itemCount > 0 ? ` · ${itemCount}` : ''}
          </button>
        </div>
      </nav>

      {/* Header */}
      <div style={{ padding: '64px 40px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 56, letterSpacing: '0.03em', lineHeight: 1 }}>EQUIPMENT RENTAL</div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 620, marginTop: 16, lineHeight: 1.6 }}>
          Browse the gear and build your kit. Add what you need to your cart, then attach it to a new booking or one you&apos;ve already made. All rentals are in-studio for now.
        </p>
      </div>

      {/* Gear grid by category */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 120px' }}>
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', fontSize: 12 }}>LOADING GEAR…</div>
        ) : gear.length === 0 ? (
          <div style={{ padding: 80, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>No equipment available right now.</div>
        ) : (
          CATEGORY_ORDER.map(cat => {
            const items = gear.filter(g => g.category === cat)
            if (!items.length) return null
            return (
              <div key={cat} style={{ marginBottom: 56 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', color: '#d4a843', marginBottom: 20 }}>
                  {(CATEGORY_LABELS[cat] || cat).toUpperCase()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {items.map(g => {
                    const inCart = qtyInCart(g.id)
                    return (
                      <div key={g.id} style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)', padding: 20, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 500, marginBottom: 6, lineHeight: 1.3 }}>{g.name}</div>
                        {g.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12, lineHeight: 1.5 }}>{g.description}</div>}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 'auto', marginBottom: 14 }}>
                          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.02em' }}>${g.rate}</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>/ booking</span>
                          {g.allow_offsite && <span style={{ marginLeft: 'auto', fontSize: 9, letterSpacing: '0.12em', color: '#d4a843', border: '1px solid rgba(212,168,67,0.3)', padding: '2px 6px' }}>OFF-SITE OK</span>}
                        </div>
                        {inCart > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.2)' }}>
                            <button onClick={() => decFromCart(g.id)} style={stepBtn}>−</button>
                            <span style={{ fontSize: 13 }}>{inCart} in cart</span>
                            <button onClick={() => addToCart(g)} disabled={inCart >= g.quantity} style={{ ...stepBtn, opacity: inCart >= g.quantity ? 0.3 : 1 }}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(g)} style={{ background: '#fff', color: '#080808', border: 'none', padding: '11px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em' }}>
                            ADD TO CART
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Cart drawer */}
      {cartOpen && (
        <>
          <div onClick={() => setCartOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, maxWidth: '90vw', background: '#0d0d0d', borderLeft: '1px solid rgba(255,255,255,0.1)', zIndex: 70, display: 'flex', flexDirection: 'column', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, letterSpacing: '0.05em' }}>YOUR KIT</div>
              <button onClick={() => setCartOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {cart.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 20 }}>Your cart is empty. Add gear to get started.</div>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {cart.map(l => (
                    <div key={l.id} style={{ background: '#111', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, marginBottom: 2 }}>{l.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>${l.rate} × {l.quantity} = ${l.rate * l.quantity}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => decFromCart(l.id)} style={miniBtn}>−</button>
                        <span style={{ fontSize: 12, minWidth: 16, textAlign: 'center' }}>{l.quantity}</span>
                        <button onClick={() => setCart(prev => prev.map(x => x.id === l.id ? { ...x, quantity: x.quantity + 1 } : x))} style={miniBtn}>+</button>
                        <button onClick={() => removeLine(l.id)} style={{ ...miniBtn, color: 'rgba(220,120,120,0.7)', marginLeft: 4 }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 16, paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 12, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>SUBTOTAL</span>
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24 }}>${subtotal}</span>
                  </div>
                  <Link href="/book?gear=1" style={{ display: 'block', textAlign: 'center', background: '#fff', color: '#080808', padding: '13px', textDecoration: 'none', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', marginBottom: 8 }}>
                    ADD TO A NEW BOOKING
                  </Link>
                  <Link href="/account/bookings?gear=1" style={{ display: 'block', textAlign: 'center', background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px', textDecoration: 'none', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.12em' }}>
                    ATTACH TO EXISTING BOOKING
                  </Link>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
                    Final availability is confirmed against your booking date &amp; time.
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const stepBtn: React.CSSProperties = { flex: 1, background: 'transparent', border: 'none', color: '#fff', padding: '10px', cursor: 'pointer', fontSize: 16 }
const miniBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', width: 24, height: 24, cursor: 'pointer', fontSize: 14, lineHeight: 1 }
