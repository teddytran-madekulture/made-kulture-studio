'use client'
import { useEffect, useState, useRef } from 'react'

interface SavedCard {
  id: string
  last_4: string
  card_brand: string
  exp_month: number
  exp_year: number
}

export default function PaymentPage() {
  const [cards, setCards]       = useState<SavedCard[]>([])
  const [loading, setLoading]   = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [error, setError]       = useState('')

  const fetchCards = () => {
    setLoading(true)
    fetch('/api/account/cards')
      .then(r => r.json())
      .then(d => { setCards(d.cards ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchCards() }, [])

  const removeCard = async (cardId: string) => {
    if (!confirm('Remove this card?')) return
    setRemoving(cardId)
    const res = await fetch('/api/account/cards', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId }),
    })
    if (res.ok) setCards(cs => cs.filter(c => c.id !== cardId))
    else setError('Failed to remove card')
    setRemoving(null)
  }

  const brandIcon = (brand: string) => {
    const b = brand?.toLowerCase()
    if (b?.includes('visa')) return '💳'
    if (b?.includes('master')) return '💳'
    if (b?.includes('amex')) return '💳'
    return '💳'
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, margin: '0 0 8px' }}>PAYMENT METHODS</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 32 }}>
        Saved cards speed up checkout — no re-entering details every time.
      </p>

      {error && (
        <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>Loading...</div>
      ) : (
        <>
          {cards.length === 0 && !showAdd && (
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.35)', marginBottom: 24 }}>
              No saved cards yet.
            </div>
          )}
          {cards.map(card => (
            <div key={card.id} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '16px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 24 }}>{brandIcon(card.card_brand)}</span>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#fff' }}>
                    {card.card_brand} •••• {card.last_4}
                  </div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                    Expires {card.exp_month}/{card.exp_year}
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeCard(card.id)}
                disabled={removing === card.id}
                style={{ background: 'none', border: '1px solid rgba(255,60,60,0.25)', borderRadius: 4, padding: '6px 14px', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: '#ff6b6b', cursor: 'pointer', opacity: removing === card.id ? 0.5 : 1 }}
              >
                {removing === card.id ? '...' : 'REMOVE'}
              </button>
            </div>
          ))}

          <button
            onClick={() => setShowAdd(true)}
            style={{ background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '12px 24px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer', marginTop: 8 }}
          >
            + ADD CARD
          </button>

          {showAdd && (
            <AddCardForm onSuccess={() => { setShowAdd(false); fetchCards() }} onCancel={() => setShowAdd(false)} />
          )}
        </>
      )}
    </div>
  )
}

function AddCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [card, setCard]       = useState<unknown>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const appId  = process.env.NEXT_PUBLIC_SQUARE_APP_ID!
    const locId  = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!
    const env    = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' ? '' : 'sandbox.'

    const script = document.createElement('script')
    script.src = `https://${env}web.squarecdn.com/v1/square.js`
    script.onload = async () => {
      const payments = (window as any).Square.payments(appId, locId)
      const c = await payments.card()
      await c.attach(containerRef.current)
      setCard(c)
    }
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const save = async () => {
    if (!card) return
    setSaving(true); setError('')
    try {
      const result = await (card as any).tokenize()
      if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message ?? 'Card error')
      const res = await fetch('/api/account/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: result.token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save card')
      onSuccess()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 24, marginTop: 16 }}>
      <div style={{ fontFamily: 'Inter', fontSize: 13, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>ADD NEW CARD</div>
      {error && (
        <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '10px 14px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b', marginBottom: 16 }}>
          {error}
        </div>
      )}
      <div ref={containerRef} style={{ minHeight: 60, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={save} disabled={saving || !card} style={{ background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '12px 24px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer', opacity: saving || !card ? 0.6 : 1 }}>
          {saving ? 'SAVING...' : 'SAVE CARD'}
        </button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '12px 24px', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
          CANCEL
        </button>
      </div>
    </div>
  )
}
