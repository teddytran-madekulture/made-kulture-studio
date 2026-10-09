'use client'
// The Set Drop page: concept → progress → reserve. The promise the customer
// ticks is dropTerms() — the SAME function the server runs before charging, so
// what is on screen is exactly what is stored on their pledge.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { dropTerms, depositFor, dollars, runLabel, fmtInstant, type SetDrop } from '@/lib/set-drops'
import SetVideo from '@/components/SetVideo'

const anton = 'Anton, "Bebas Neue", sans-serif'
const mono = '"JetBrains Mono", ui-monospace, monospace'
const inter = 'Inter, sans-serif'
const GOLD = '#c9b27e'
const dim = (a: number) => `rgba(255,255,255,${a})`

type PublicDrop = SetDrop & {
  phase: string
  depositor_rate: number | null
  progress: { label: string; pct: number; remaining: number; goalType: string } | null
  people: number
  set_slug: string | null
  open_call: { slug: string; title: string } | null
  past_gallery: { url: string; credit: string | null }[]
}
interface Mine { hours_wanted: number | null; deposit_cents: number; status: string; timing_note: string | null }
interface Card { id: string; last_4: string; card_brand: string }

const btn: React.CSSProperties = { fontFamily: inter, fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '15px 26px', textDecoration: 'none', border: 'none', cursor: 'pointer', display: 'inline-block' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', color: dim(0.8), border: `1px solid ${dim(0.25)}` }
const label: React.CSSProperties = { fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: dim(0.45), display: 'block', marginBottom: 8 }
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'transparent', border: `1px solid ${dim(0.2)}`, color: '#fff', padding: '13px 14px', fontFamily: inter, fontSize: 15, colorScheme: 'dark' }

export default function DropClient({ slug }: { slug: string }) {
  const [drop, setDrop] = useState<PublicDrop | null>(null)
  const [mine, setMine] = useState<Mine | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [preview, setPreview] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [loadErr, setLoadErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/drops/${slug}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setLoadErr(d.error || 'Could not load this drop.'); return }
    setDrop(d.drop); setMine(d.mine); setSignedIn(!!d.signedIn); setPreview(!!d.preview)
  }, [slug])
  useEffect(() => { load() }, [load])

  if (loadErr) return <p style={{ padding: '160px 20px', textAlign: 'center', fontFamily: inter, color: dim(0.5) }}>{loadErr}</p>
  if (!drop) return <p style={{ padding: '160px 20px', textAlign: 'center', fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: dim(0.4) }}>LOADING…</p>

  const phase = drop.phase
  const kicker = { pre_reserve: 'SET DROP · ONLY BUILT IF YOU WANT IT', deciding: 'SET DROP · RESERVATIONS CLOSED', early_access: 'SET DROP · EARLY ACCESS', open: 'SET DROP · NOW BOOKING', ended: 'SET DROP · RUN ENDED', cancelled: 'SET DROP', archived: 'SET DROP' }[phase] ?? 'SET DROP'
  const bookHref = drop.set_slug ? `/book?type=set&set=${drop.set_slug}${drop.run_starts ? `&date=${drop.run_starts}` : ''}` : '/book'
  const gallery = (drop.gallery ?? []).filter(u => u && u !== drop.hero_url)

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{ position: 'relative', minHeight: 'min(86svh, 760px)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden', background: '#111' }}>
        {drop.video_url && drop.video_hero
          ? <SetVideo src={drop.video_url} poster={drop.hero_url} name={drop.name} variant="hero" />
          /* eslint-disable-next-line @next/next/no-img-element */
          : drop.hero_url && <img src={drop.hero_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(8,8,8,0.2) 0%, rgba(8,8,8,0.35) 45%, #080808 100%)' }} />
        <div style={{ position: 'relative', maxWidth: 1100, width: '100%', margin: '0 auto', padding: '160px 20px 48px', pointerEvents: 'none' /* lets the video's sound button through; the CTA row turns events back on */ }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: GOLD, marginBottom: 14 }}>{kicker}</div>
          <h1 style={{ fontFamily: anton, fontSize: 'clamp(54px, 11vw, 140px)', lineHeight: 0.88, margin: 0, letterSpacing: '0.01em' }}>{drop.name.toUpperCase()}</h1>
          {drop.tagline && <p style={{ fontFamily: inter, fontSize: 'clamp(16px, 2.2vw, 20px)', color: dim(0.75), lineHeight: 1.5, maxWidth: 640, margin: '18px 0 0' }}>{drop.tagline}</p>}
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.12em', color: dim(0.6), marginTop: 18 }}>{runLabel(drop).toUpperCase()} · HOUSTON</div>

          {(drop.progress || drop.people > 0) && phase === 'pre_reserve' && (
            <div style={{ maxWidth: 520, marginTop: 28 }}>
              {drop.progress && <div style={{ height: 6, background: dim(0.15) }}><div style={{ height: 6, width: `${Math.max(drop.progress.pct, 2)}%`, background: GOLD, transition: 'width .6s' }} /></div>}
              <div style={{ fontFamily: inter, fontSize: 13, color: dim(0.7), marginTop: 10 }}>
                {drop.progress ? drop.progress.label : `${drop.people} ${drop.people === 1 ? 'person has' : 'people have'} reserved`}
                {drop.pre_reserve_ends_at ? ` · closes ${fmtInstant(drop.pre_reserve_ends_at)}` : ''}
              </div>
              {drop.progress && (
                <div style={{ fontFamily: inter, fontSize: 13, color: GOLD, marginTop: 6 }}>
                  {drop.progress.remaining > 0
                    ? `${drop.progress.remaining} more ${drop.progress.goalType === 'hours' ? 'hours' : drop.progress.goalType === 'dollars' ? 'dollars' : (drop.progress.remaining === 1 ? 'reservation' : 'reservations')} and it gets built.`
                    : 'Goal reached — it’s getting built.'}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28, pointerEvents: 'auto' }}>
            {phase === 'pre_reserve' && !mine && <a href="#reserve" style={btn}>VOTE TO BUILD IT · {dollars(depositFor(drop, Math.max(1, Number(drop.min_hours) || 1)))}{drop.deposit_mode === 'per_hour' ? '/HR' : ''} DEPOSIT</a>}
            {(phase === 'open' || (phase === 'early_access' && mine && mine.status !== 'refunded')) && <Link href={bookHref} style={btn}>BOOK YOUR DATES ↗</Link>}
            {drop.open_call && <Link href={`/submissions#${drop.open_call.slug}`} style={ghost}>OPEN CALL ↗</Link>}
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 96px' }}>
        {/* ── Status banners ───────────────────────────────────── */}
        {preview && <Banner>PREVIEW — only you can see this. It&rsquo;s how the page will look once you press OPEN RESERVATIONS; nothing can be reserved from it yet.</Banner>}
        {phase === 'deciding' && <Banner>Reservations are closed. We&rsquo;re deciding whether to build it — everyone who reserved hears first.</Banner>}
        {phase === 'early_access' && (mine && mine.status !== 'refunded'
          ? <Banner>It&rsquo;s happening. Your early access to book runs until {fmtInstant(drop.early_access_ends_at)} — your deposit is already credit on your account.</Banner>
          : <Banner>It&rsquo;s happening. People who reserved are booking first until {fmtInstant(drop.early_access_ends_at)}; it opens to everyone after that.</Banner>)}
        {phase === 'cancelled' && <Banner>This one isn&rsquo;t happening — not enough reservations this time. Everyone who reserved has been emailed about their deposit.</Banner>}
        {phase === 'ended' && <Banner>This run has ended. Keep an eye out for the next drop.</Banner>}

        {/* ── Your vote decides ─────────────────────────────────── */}
        {phase === 'pre_reserve' && (
          <div style={{ marginTop: 32, border: `1px solid ${GOLD}66`, padding: 'clamp(20px, 3vw, 32px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'center' }}>
            <div style={{ fontFamily: anton, fontSize: 'clamp(34px, 5vw, 56px)', lineHeight: 0.95 }}>YOUR VOTE<br />DECIDES.</div>
            <div style={{ fontFamily: inter, fontSize: 15, color: dim(0.75), lineHeight: 1.65 }}>
              {drop.name} is <strong style={{ color: '#fff' }}>not built yet</strong> — and it only gets built if enough of you want it.
              Your reservation is your vote. If we hit the goal{drop.pre_reserve_ends_at ? ` by ${fmtInstant(drop.pre_reserve_ends_at)}` : ''}, we build it and you book first.
              If we don&rsquo;t, it doesn&rsquo;t happen and your deposit comes back to you{drop.cancel_policy === 'refund' ? ' as a full refund' : drop.cancel_policy === 'credit' ? ' as studio credit' : drop.cancel_policy === 'choice' ? ' — refund or studio credit, your pick' : ''}.
            </div>
          </div>
        )}

        {/* ── The idea ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 48, marginTop: 40 }}>
          <div>
            <div style={label}>THE SET</div>
            {drop.description
              ? drop.description.split(/\n{2,}/).map((para, i) => <p key={i} style={{ fontFamily: inter, fontSize: 16, color: dim(0.72), lineHeight: 1.75, margin: '0 0 16px' }}>{para}</p>)
              : <p style={{ fontFamily: inter, fontSize: 16, color: dim(0.5), lineHeight: 1.7 }}>Details coming soon.</p>}
          </div>
          <div>
            <div style={label}>THE DETAILS</div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 24px', fontFamily: inter, fontSize: 14 }}>
              <dt style={{ color: dim(0.45) }}>Runs</dt><dd style={{ margin: 0 }}>{runLabel(drop)}</dd>
              <dt style={{ color: dim(0.45) }}>Rate</dt><dd style={{ margin: 0 }}>${drop.rate_per_hour}/hr member{drop.depositor_rate != null ? <> · <span style={{ color: GOLD }}>${drop.depositor_rate}/hr if you reserve</span></> : ''}</dd>
              <dt style={{ color: dim(0.45) }}>Booking</dt><dd style={{ margin: 0 }}>{Number(drop.min_hours) > 1 ? `${drop.min_hours}-hour minimum` : '1-hour minimum'} · up to {drop.capacity} people</dd>
              {drop.pre_reserve_ends_at && phase === 'pre_reserve' && <><dt style={{ color: dim(0.45) }}>Reserve by</dt><dd style={{ margin: 0 }}>{fmtInstant(drop.pre_reserve_ends_at)}</dd></>}
            </dl>
          </div>
        </div>

        {drop.video_url && !drop.video_hero && (
          <div style={{ marginTop: 48 }}><SetVideo src={drop.video_url} poster={drop.hero_url} name={drop.name} variant="block" /></div>
        )}

        {gallery.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2, marginTop: 48 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {gallery.map(u => <img key={u} src={u} alt="" style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block' }} />)}
          </div>
        )}

        {/* ── Shot here in past years ──────────────────────────── */}
        {(drop.past_gallery ?? []).length > 0 && (
          <div style={{ marginTop: 64 }}>
            <div style={label}>SHOT ON {drop.name.toUpperCase()} · PAST YEARS</div>
            <div style={{ columnWidth: 260, columnGap: 2 }}>
              {drop.past_gallery.map((p, i) => (
                <figure key={p.url} style={{ margin: '0 0 2px', breakInside: 'avoid', cursor: 'zoom-in' }} onClick={() => setLightbox(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.credit ? `Shot on ${drop.name} — ${p.credit}` : `Shot on ${drop.name}`} loading="lazy" style={{ width: '100%', display: 'block' }} />
                  {p.credit && <figcaption style={{ fontFamily: inter, fontSize: 11, color: dim(0.5), padding: '6px 2px 10px', letterSpacing: '0.02em' }}>{p.credit}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        )}
        {lightbox != null && drop.past_gallery?.[lightbox] && (
          <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={drop.past_gallery[lightbox].url} alt="" style={{ maxWidth: '100%', maxHeight: 'calc(85 * var(--svh, 1vh))', objectFit: 'contain' }} />
            {drop.past_gallery[lightbox].credit && <div style={{ fontFamily: inter, fontSize: 13, color: dim(0.7), marginTop: 12 }}>{drop.past_gallery[lightbox].credit}</div>}
            <div style={{ display: 'flex', gap: 16, marginTop: 14 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setLightbox(i => i == null ? null : (i - 1 + drop.past_gallery.length) % drop.past_gallery.length)} style={ghost}>‹ PREV</button>
              <button onClick={() => setLightbox(i => i == null ? null : (i + 1) % drop.past_gallery.length)} style={ghost}>NEXT ›</button>
            </div>
          </div>
        )}

        {/* ── How it works ─────────────────────────────────────── */}
        <div style={{ marginTop: 64 }}>
          <div style={label}>HOW A SET DROP WORKS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 2, background: dim(0.06) }}>
            {[
              ['01', 'Cast your vote', `Reserve with a ${dollars(depositFor(drop, 1))}${drop.deposit_mode === 'per_hour' ? ' per hour' : ''} deposit. It's not a booking yet — it's your vote to build it.`],
              ['02', 'You decide', `If enough of you reserve by ${drop.pre_reserve_ends_at ? fmtInstant(drop.pre_reserve_ends_at) : 'the deadline'}, we build it. If not, it doesn't happen and your deposit comes back to you.`],
              ['03', 'You book first', `Your deposit becomes studio credit${drop.perk_early_access ? `, and you get ${drop.early_access_hours} hours to pick your dates before anyone else` : ''}.`],
            ].map(([n, h, p]) => (
              <div key={n} style={{ background: '#080808', padding: '26px 22px' }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: GOLD, letterSpacing: '0.15em' }}>{n}</div>
                <div style={{ fontFamily: anton, fontSize: 26, margin: '10px 0 8px' }}>{h.toUpperCase()}</div>
                <p style={{ fontFamily: inter, fontSize: 14, color: dim(0.6), lineHeight: 1.6, margin: 0 }}>{p}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Reserve ──────────────────────────────────────────── */}
        {phase === 'pre_reserve' && (
          <div id="reserve" style={{ marginTop: 64, scrollMarginTop: 120, maxWidth: 640 }}>
            <div style={label}>RESERVE</div>
            {mine && mine.status !== 'refunded' ? (
              <div style={{ border: `1px solid ${GOLD}66`, padding: 24 }}>
                <div style={{ fontFamily: anton, fontSize: 30 }}>YOU&rsquo;RE IN</div>
                <p style={{ fontFamily: inter, fontSize: 15, color: dim(0.7), lineHeight: 1.6, margin: '8px 0 0' }}>
                  Your {dollars(mine.deposit_cents)} deposit is in{mine.hours_wanted ? ` for about ${mine.hours_wanted} hour${mine.hours_wanted === 1 ? '' : 's'}` : ''}{mine.timing_note ? ` (${mine.timing_note})` : ''}. We&rsquo;ll email you the moment we decide.
                </p>
              </div>
            ) : !signedIn ? (
              <div style={{ border: `1px solid ${dim(0.15)}`, padding: 24 }}>
                <p style={{ fontFamily: inter, fontSize: 15, color: dim(0.7), lineHeight: 1.6, margin: '0 0 18px' }}>Reserving needs a free Made Kulture account — your deposit turns into credit on it if this happens.</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Link href={`/login?next=${encodeURIComponent(`/drops/${slug}#reserve`)}`} style={btn}>SIGN IN</Link>
                  <Link href={`/signup?next=${encodeURIComponent(`/drops/${slug}#reserve`)}`} style={ghost}>CREATE AN ACCOUNT</Link>
                </div>
              </div>
            ) : (
              <ReserveForm drop={drop} slug={slug} onDone={load} preview={preview} />
            )}
          </div>
        )}
      </div>
    </>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return <div style={{ border: `1px solid ${GOLD}55`, background: 'rgba(201,178,126,0.07)', padding: '16px 20px', fontFamily: inter, fontSize: 15, color: dim(0.85), lineHeight: 1.6 }}>{children}</div>
}

function ReserveForm({ drop, slug, onDone, preview }: { drop: PublicDrop; slug: string; onDone: () => void; preview?: boolean }) {
  const min = Math.max(0.5, Number(drop.min_hours) || 1)
  const max = Math.max(min, Number(drop.max_hours_per_pledge) || 8)
  const options: number[] = []
  for (let h = min; h <= max + 1e-9; h += 0.5) options.push(Math.round(h * 2) / 2)
  const flat = drop.deposit_mode !== 'per_hour'
  // Flat deposit: 0 = "not sure" (optional). Per-hour: required, starts at the minimum.
  const [hours, setHours] = useState(flat ? 0 : min)
  const [timing, setTiming] = useState('')
  const [minis, setMinis] = useState(false)
  const [agree, setAgree] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [cardChoice, setCardChoice] = useState<string>('new')
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardObj, setCardObj] = useState<any>(null)

  const terms = dropTerms(drop, hours || min)
  const cents = depositFor(drop, hours || min)

  useEffect(() => {
    fetch('/api/account/cards?dedupe=1', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
      const cs: Card[] = d?.cards ?? []
      setCards(cs)
      if (cs.length) setCardChoice(cs[0].id)
    }).catch(() => {})
  }, [])

  // Square card form — only while "new card" is picked.
  useEffect(() => {
    if (cardChoice !== 'new' || cents === 0) return
    let cancelled = false
    const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID
    const locId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
    if (!appId || !locId) { setErr('Payment isn’t configured. Text the studio.'); return }
    const src = appId.startsWith('sandbox-') ? 'https://sandbox.web.squarecdn.com/v1/square.js' : 'https://web.squarecdn.com/v1/square.js'
    let attached: any = null
    const init = async () => {
      try {
        const payments = (window as any).Square.payments(appId, locId)
        const c = await payments.card()
        if (cancelled || !cardRef.current) return
        cardRef.current.innerHTML = ''
        await c.attach(cardRef.current)
        attached = c
        if (!cancelled) setCardObj(c)
      } catch { if (!cancelled) setErr('Could not load the card form. Refresh and try again.') }
    }
    if ((window as any).Square) init()
    else {
      let s = document.getElementById('square-sdk') as HTMLScriptElement | null
      if (!s) { s = document.createElement('script'); s.id = 'square-sdk'; s.src = src; document.head.appendChild(s) }
      s.addEventListener('load', init)
    }
    return () => { cancelled = true; try { attached?.destroy?.() } catch {} ; setCardObj(null) }
  }, [cardChoice, cents])

  const submit = async () => {
    setErr('')
    if (preview) { setErr('This is a preview — reservations open when you press OPEN RESERVATIONS in admin.'); return }
    if (!agree) { setErr('Tick the box to confirm what happens to your deposit.'); return }
    setPaying(true)
    try {
      const payload: Record<string, unknown> = { hours: hours || null, timingNote: timing, plansMinis: minis, agree: true, termsShown: terms.full }
      if (cents > 0) {
        if (cardChoice === 'new') {
          if (!cardObj) throw new Error('The card form is still loading.')
          const t = await cardObj.tokenize()
          if (t.status !== 'OK') throw new Error(t.errors?.[0]?.message ?? 'Check your card details.')
          payload.sourceId = t.token
        } else payload.savedCardId = cardChoice
      }
      const r = await fetch(`/api/drops/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'That didn’t go through.')
      onDone()
    } catch (e: any) { setErr(e.message); setPaying(false) }
  }

  return (
    <div style={{ border: `1px solid ${dim(0.15)}`, padding: 24, display: 'grid', gap: 20 }}>
      <label>
        <span style={label}>ABOUT HOW MANY HOURS WOULD YOU BOOK?{flat ? ' (OPTIONAL)' : ''}</span>
        <select value={hours} onChange={e => setHours(Number(e.target.value))} style={field}>
          {flat && <option value={0} style={{ background: '#111', color: '#fff' }}>Not sure yet</option>}
          {options.map(h => <option key={h} value={h} style={{ background: '#111', color: '#fff' }}>{h} hour{h === 1 ? '' : 's'}{drop.deposit_mode === 'per_hour' ? ` — ${dollars(depositFor(drop, h))} deposit` : ''}</option>)}
        </select>
      </label>
      <label>
        <span style={label}>ROUGHLY WHEN? (OPTIONAL)</span>
        <input value={timing} onChange={e => setTiming(e.target.value)} maxLength={200} placeholder="e.g. a weekend evening in mid-December" style={field} />
      </label>
      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={minis} onChange={e => setMinis(e.target.checked)} style={{ marginTop: 3, accentColor: GOLD }} />
        <span style={{ fontFamily: inter, fontSize: 14, color: dim(0.8), lineHeight: 1.6 }}>
          I’m planning to run mini sessions. <span style={{ color: dim(0.5) }}>Once you book, Mini Sessions gives you a sign-up link for your clients and keeps the day organized.</span>
        </span>
      </label>

      {cents > 0 && (
        <div>
          <span style={label}>PAY THE {dollars(cents)} DEPOSIT WITH</span>
          {cards.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              {cards.map(c => (
                <label key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: inter, fontSize: 14, cursor: 'pointer' }}>
                  <input type="radio" checked={cardChoice === c.id} onChange={() => setCardChoice(c.id)} /> {c.card_brand} ···· {c.last_4}
                </label>
              ))}
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: inter, fontSize: 14, cursor: 'pointer' }}>
                <input type="radio" checked={cardChoice === 'new'} onChange={() => setCardChoice('new')} /> A different card
              </label>
            </div>
          )}
          {cardChoice === 'new' && <div ref={cardRef} style={{ minHeight: 60 }} />}
        </div>
      )}

      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', border: `1px solid ${agree ? GOLD : dim(0.15)}`, padding: 16 }}>
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 3, accentColor: GOLD }} />
        <span style={{ fontFamily: inter, fontSize: 14, color: dim(0.8), lineHeight: 1.6 }}>
          {terms.ifFunded} {terms.ifCancelled} {terms.balance}
        </span>
      </label>

      {err && <div style={{ fontFamily: inter, fontSize: 14, color: '#ff8a80' }}>{err}</div>}
      <button onClick={submit} disabled={paying} style={{ ...btn, opacity: paying ? 0.6 : 1, justifySelf: 'start' }}>
        {paying ? 'RESERVING…' : `RESERVE MY VOTE · ${dollars(cents)} DEPOSIT`}
      </button>
    </div>
  )
}
