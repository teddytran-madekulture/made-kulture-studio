'use client'

// Concept review form. Sent to a guest who has been told no and pressed anyway.
//
// The tone is deliberately not encouraging. Every heading restates that the
// default answer is no, because the worst outcome here is somebody spending a
// week planning a shoot they were never going to be allowed to do.

import { useState } from 'react'

const GOLD = '#d4a843'
const LINE = '1px solid rgba(255,255,255,0.14)'

const label: React.CSSProperties = {
  display: 'block', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)', marginBottom: 8,
}
const help: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.45)', margin: '0 0 10px',
}
const field: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: LINE, borderRadius: 10,
  color: '#fff', padding: '12px 14px', fontSize: 15, fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <span style={label}>{title}</span>
      {hint && <p style={help}>{hint}</p>}
      {children}
    </div>
  )
}

export default function ConceptReviewClient() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hasBooking, setHasBooking] = useState(false)
  const [ack, setAck] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    if (!ack) { setErr('Please read and accept the terms at the bottom.'); return }
    setBusy(true)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('has_booking', String(hasBooking))
      fd.set('acknowledged', 'true')
      const r = await fetch('/api/concept-review', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Something went wrong. Please try again.'); return }
      setDone(true)
    } catch {
      setErr('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <main style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <h1 style={{ fontSize: 26, letterSpacing: '0.04em', margin: '0 0 16px' }}>Submitted for review</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, fontSize: 15 }}>
            We&rsquo;ll read it properly and reply by text. Approval is case by case and
            is never guaranteed &mdash; please don&rsquo;t book around this concept until
            you have a written approval from us.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif', padding: '48px 20px' }}>
      <div style={{ maxWidth: 660, margin: '0 auto' }}>

        <h1 style={{ fontSize: 30, letterSpacing: '0.04em', margin: '0 0 14px' }}>Concept Review</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, fontSize: 15, margin: '0 0 12px' }}>
          Paint, fake blood, glitter, smoke bombs and excessive oils are not allowed
          in the studio. If your shoot genuinely needs something messy, or anything
          outside how the studio normally runs, you can put it forward here.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, fontSize: 15, margin: '0 0 34px' }}>
          <strong style={{ color: GOLD }}>The default answer is no.</strong> Reviews are
          decided case by case, approval is never guaranteed, and an approved concept
          carries a refundable cleaning deposit. Please don&rsquo;t plan around a
          concept until it has been approved in writing.
        </p>

        <form onSubmit={submit}>

          <Block title="Your details">
            <div style={{ display: 'grid', gap: 10 }}>
              <input name="name" placeholder="Full name" required style={field} />
              <input name="email" type="email" placeholder="Email" required style={field} />
              <input name="phone" type="tel" placeholder="Mobile number — the decision comes by text" required style={field} />
            </div>
          </Block>

          <Block title="Booking">
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              {[['Not booked yet', false], ['Already booked', true]].map(([lbl, val]) => (
                <button key={String(val)} type="button" onClick={() => setHasBooking(val as boolean)}
                  style={{
                    flex: 1, padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                    fontFamily: 'Inter, sans-serif', letterSpacing: '0.06em',
                    background: hasBooking === val ? 'rgba(212,168,67,0.15)' : 'transparent',
                    border: hasBooking === val ? `1px solid ${GOLD}` : LINE,
                    color: hasBooking === val ? GOLD : 'rgba(255,255,255,0.6)',
                  }}>{lbl as string}</button>
              ))}
            </div>
            {hasBooking && (
              <div style={{ display: 'grid', gap: 10 }}>
                <input name="booking_date" type="date" style={field} />
                <input name="set_names" placeholder="Which set(s)" style={field} />
              </div>
            )}
          </Block>

          <Block title="The concept" hint="What are you shooting, and what does the messy element actually do for it?">
            <textarea name="concept" required rows={5} style={field} />
          </Block>

          <Block
            title="Exact products"
            hint="Brand and product name, not a category. Water-activated body paint and alcohol-based airbrush are completely different problems for us — 'body paint' on its own tells us nothing and we'll have to come back and ask."
          >
            <textarea name="materials" required rows={3} style={field} />
          </Block>

          <Block
            title="Where it happens"
            hint="Which set — and be specific about where people are made up and where they clean off. Restrooms, the lounge and every common area are shared space that nobody books, so they can't be used for this. If you need somewhere to apply or remove, say so here and we'll tell you what's possible."
          >
            <textarea name="location_plan" required rows={4} style={field} />
          </Block>

          <Block title="How many people" hint="Everyone involved in the messy part, including crew.">
            <input name="headcount" type="number" min={1} style={{ ...field, maxWidth: 160 }} />
          </Block>

          <Block
            title="Prep plan"
            hint="How the space gets protected before you start — floor covering, barriers, what you're bringing with you."
          >
            <textarea name="prep_plan" required rows={4} style={field} />
          </Block>

          <Block
            title="Cleaning plan"
            hint="Who cleans, with what, and how the set and any shared space get returned to how you found them."
          >
            <textarea name="cleanup_plan" required rows={4} style={field} />
          </Block>

          <Block
            title="Cleanup time needed"
            hint="Minutes. Cleanup has to happen inside your booked time, so build it into the booking rather than running over."
          >
            <input name="cleanup_minutes" type="number" min={0} step={15} style={{ ...field, maxWidth: 160 }} />
          </Block>

          <Block title="Reference photos" hint="Up to 6 images, 8MB each. Mood, references, or the actual products.">
            <input name="photos" type="file" accept="image/*" multiple
              style={{ ...field, padding: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }} />
          </Block>

          <div style={{ border: LINE, borderRadius: 12, padding: 18, marginBottom: 26, background: 'rgba(255,255,255,0.02)' }}>
            <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}
                style={{ marginTop: 3, width: 17, height: 17, accentColor: GOLD, flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.68)' }}>
                I understand that submitting this is not approval and that approval is
                never guaranteed; that an approved concept carries a refundable cleaning
                deposit, returned if the studio is left fully clean; that cleaning charges
                apply if it isn&rsquo;t, and damage to sets, props or equipment is billed;
                that cleanup happens inside my booked time; and that only a written
                approval from Made Kulture counts.
              </span>
            </label>
          </div>

          {err && (
            <p style={{ color: '#ff8f7a', fontSize: 14, marginBottom: 16 }}>{err}</p>
          )}

          <button type="submit" disabled={busy}
            style={{
              width: '100%', padding: '16px', borderRadius: 12, border: 'none', cursor: busy ? 'default' : 'pointer',
              background: busy ? 'rgba(255,255,255,0.12)' : 'linear-gradient(135deg,#d7c08b,#9c8250)',
              color: busy ? 'rgba(255,255,255,0.5)' : '#0a0a0a',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', fontFamily: 'Inter, sans-serif',
            }}>
            {busy ? 'SUBMITTING…' : 'SUBMIT FOR REVIEW'}
          </button>

        </form>
      </div>
    </main>
  )
}
