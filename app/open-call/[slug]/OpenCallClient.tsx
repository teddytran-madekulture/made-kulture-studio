'use client'

// Open Call entry form + "your entry" view. Photos are shrunk in the browser,
// then uploaded STRAIGHT to the private bucket with a signed URL from
// ./api/open-calls/<slug>/upload — the 4.5 MB function ceiling never sees them.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { shrinkImage } from '@/lib/shrink-image'
import { OPEN_CALL_BUCKET, OPEN_CALL_IMAGE_EDGE, OPEN_CALL_MIN_EDGE, OPEN_CALL_MAX_CREDITS, OPEN_CALL_MIN_IMAGES, type OpenCallPhase } from '@/lib/open-calls'

const GOLD = '#c9b27e'
const mono = '"JetBrains Mono", ui-monospace, monospace'
const anton = 'Anton, "Bebas Neue", sans-serif'
const LINE = '1px solid rgba(255,255,255,0.14)'
const lbl: React.CSSProperties = { display: 'block', fontFamily: mono, fontSize: 10.5, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.55)', marginBottom: 8 }
const help: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.45)', margin: '0 0 10px' }
const field: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: LINE, color: '#fff', padding: '12px 14px', fontSize: 16, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', colorScheme: 'dark' }
const btnPrimary: React.CSSProperties = { background: '#fff', color: '#000', border: 'none', padding: '16px 28px', fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
const btnGhost: React.CSSProperties = { ...btnPrimary, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }

interface Mine { id: string; title: string; photographer: string; status: string; created_at: string; images: string[] }
interface Img { key: string; preview: string; path: string | null; hash?: string; mature?: boolean; error?: string }
interface Credit { role: string; name: string; handle: string }

const STATUS_COPY: Record<string, string> = {
  pending: 'Received and under review.',
  shortlisted: 'Shortlisted. Your series goes to the directory vote.',
  declined: "Not shortlisted this time. Thank you for shooting it with us.",
  winner: 'Winner. We will be in touch.',
}

export default function OpenCallClient({ slug, title, setName, setSlug, maxImages, closes, rolling, path, collapsible = false, inPanel = false }: {
  slug: string; title: string; setName: string | null; setSlug: string | null; maxImages: number; closes: string | null; rolling: boolean; path: string
  collapsible?: boolean   // the form opens behind a button
  inPanel?: boolean       // rendered inside the /submissions side panel
}) {
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<OpenCallPhase>('open')
  const [signedIn, setSignedIn] = useState(false)
  const [mine, setMine] = useState<Mine | null>(null)
  const [done, setDone] = useState(false)
  const [expanded, setExpanded] = useState(!collapsible)

  const load = async () => {
    const r = await fetch(`/api/open-calls/${slug}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setPhase(d.phase); setSignedIn(!!d.signedIn); setMine(d.mine ?? null) }
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const here = path
  const wrap: React.CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: inPanel ? '28px 24px 64px' : collapsible ? '28px 20px 80px' : '40px 20px 96px', fontFamily: 'Inter, sans-serif' }

  if (loading) return <section style={wrap}><p style={help}>Loading…</p></section>

  if (mine) {
    return (
      <section style={wrap}>
        <div style={{ ...lbl, color: GOLD }}>YOUR ENTRY</div>
        <h2 style={{ fontFamily: anton, fontSize: 40, margin: '0 0 6px', letterSpacing: '0.02em' }}>{mine.title.toUpperCase()}</h2>
        <p style={{ ...help, fontSize: 15 }}>by {mine.photographer}. {STATUS_COPY[mine.status] ?? ''}</p>
        {done && <p style={{ ...help, color: GOLD }}>Submitted. A confirmation is on its way to your email.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6, margin: '20px 0 28px' }}>
          {mine.images.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="" style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', background: '#111' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/account/profile" style={btnPrimary}>FINISH YOUR DIRECTORY PROFILE ↗</Link>
          {mine.status === 'pending' && phase === 'open' && (
            <button style={btnGhost} onClick={async () => {
              if (!confirm('Withdraw this entry? Your images will be deleted and you can submit a new one.')) return
              const r = await fetch(`/api/open-calls/${slug}`, { method: 'DELETE' })
              const d = await r.json().catch(() => ({}))
              if (!r.ok) { alert(d.error || 'Could not withdraw.'); return }
              setDone(false); setMine(null)
            }}>WITHDRAW &amp; RESUBMIT</button>
          )}
        </div>
      </section>
    )
  }

  if (phase !== 'open') {
    return (
      <section style={wrap}>
        <p style={{ ...help, fontSize: 15 }}>
          {phase === 'upcoming' ? 'Dates and details coming soon.' : phase === 'voting' ? 'Submissions are closed and the directory vote is on.' : 'Submissions for this open call are closed.'}
        </p>
        <Link href="/account/directory" style={btnPrimary}>GO TO THE DIRECTORY ↗</Link>
      </section>
    )
  }

  if (!expanded) {
    return (
      <section style={wrap}>
        <button onClick={() => setExpanded(true)} style={btnPrimary}>
          {rolling ? 'SUBMIT YOUR SERIES' : `SUBMIT TO ${title.toUpperCase()}`} ↓
        </button>
      </section>
    )
  }

  if (!signedIn) {
    return (
      <section style={wrap}>
        <div style={{ border: LINE, padding: '32px 28px', background: '#0b0b0d' }}>
          <div style={{ ...lbl, color: GOLD }}>ENTER</div>
          <h2 style={{ fontFamily: anton, fontSize: 'clamp(30px, 5vw, 44px)', margin: '0 0 10px', letterSpacing: '0.02em' }}>SIGN IN TO SUBMIT</h2>
          <p style={{ ...help, fontSize: 15, maxWidth: 620 }}>
            Entries come from Made Kulture members. A free account takes a minute, gets you member rates on every set,
            and a place in the directory, where the vote happens.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
            <Link href={`/signup?next=${encodeURIComponent(here)}`} style={btnPrimary}>CREATE A FREE ACCOUNT</Link>
            <Link href={`/login?next=${encodeURIComponent(here)}`} style={btnGhost}>SIGN IN</Link>
          </div>
        </div>
        <FinePrint title={title} setName={setName} closes={closes} rolling={rolling} />
      </section>
    )
  }

  return (
    <section style={wrap}>
      <EntryForm slug={slug} setName={setName} setSlug={setSlug} maxImages={maxImages} rolling={rolling} onDone={async () => { setDone(true); await load() }} />
      <FinePrint title={title} setName={setName} closes={closes} rolling={rolling} />
    </section>
  )
}

function EntryForm({ slug, setName, setSlug, maxImages, rolling, onDone }: { slug: string; setName: string | null; setSlug: string | null; maxImages: number; rolling: boolean; onDone: () => void }) {
  const [imgs, setImgs] = useState<Img[]>([])
  const [uploading, setUploading] = useState(0)
  const [credits, setCredits] = useState<Credit[]>([{ role: 'Model', name: '', handle: '' }, { role: 'MUA', name: '', handle: '' }])
  const [consents, setConsents] = useState<Consents>({ shotHere: false, rights: false, adults: false, feature: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sb = useRef(createClient())

  const addFiles = async (list: File[]) => {
    setErr(null)
    const all = list.filter(f => f.type.startsWith('image/'))
    // Requirement: at least OPEN_CALL_MIN_EDGE px on the long side, checked on
    // the ORIGINAL before the browser shrinks it. Screenshots and images saved
    // from Instagram fail here, which is the point.
    const sized = await Promise.all(all.map(async f => ({ f, edge: await longEdge(f) })))
    const small = sized.filter(x => x.edge > 0 && x.edge < OPEN_CALL_MIN_EDGE)
    const files = sized.filter(x => !(x.edge > 0 && x.edge < OPEN_CALL_MIN_EDGE)).map(x => x.f)
    if (small.length) setErr(`${small.length} image${small.length > 1 ? 's are' : ' is'} under ${OPEN_CALL_MIN_EDGE}px on the long side and ${small.length > 1 ? 'were' : 'was'} skipped. Use the full-resolution export.`)
    const room = maxImages - imgs.length
    if (room <= 0) { setErr(`Up to ${maxImages} images.`); return }
    const batch = files.slice(0, room)
    if (!batch.length) return
    setUploading(n => n + batch.length)
    let tickets: { path: string; token: string }[] = []
    try {
      const r = await fetch(`/api/open-calls/${slug}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: batch.length }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      tickets = d.uploads
    } catch (e: any) {
      setErr(e.message || 'Upload failed'); setUploading(n => n - batch.length); return
    }
    await Promise.all(batch.map(async (file, i) => {
      const key = Math.random().toString(36).slice(2)
      const preview = URL.createObjectURL(file)
      setImgs(cur => [...cur, { key, preview, path: null }])
      try {
        const blob = await shrinkImage(file, OPEN_CALL_IMAGE_EDGE, 0.88)
        const hash = await dHash(blob).catch(() => '')
        const t = tickets[i]
        const { error } = await sb.current.storage.from(OPEN_CALL_BUCKET).uploadToSignedUrl(t.path, t.token, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        setImgs(cur => cur.map(x => x.key === key ? { ...x, path: t.path, hash } : x))
      } catch {
        setImgs(cur => cur.map(x => x.key === key ? { ...x, error: 'Failed. Remove and re-add.' } : x))
      } finally {
        setUploading(n => n - 1)
      }
    }))
  }

  const move = (i: number, d: -1 | 1) => setImgs(cur => {
    const j = i + d; if (j < 0 || j >= cur.length) return cur
    const next = cur.slice(); [next[i], next[j]] = [next[j], next[i]]; return next
  })

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErr(null)
    const ready = imgs.filter(i => i.path)
    if (uploading > 0) { setErr('Hang on, images are still uploading.'); return }
    if (ready.length < OPEN_CALL_MIN_IMAGES) { setErr(`Add at least ${OPEN_CALL_MIN_IMAGES} images.`); return }
    if (ready.filter(i => !i.mature).length < OPEN_CALL_MIN_IMAGES) { setErr(`At least ${OPEN_CALL_MIN_IMAGES} images must be free of nudity, so the series can be shown publicly if it's picked.`); return }
    if (!Object.values(consents).every(Boolean)) { setErr('Please tick all four confirmations.'); return }
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const r = await fetch(`/api/open-calls/${slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: fd.get('title'), photographer: fd.get('photographer'), photographer_ig: fd.get('photographer_ig'),
          shoot_date: fd.get('shoot_date'), note: fd.get('note'), credits, consents,
          mature_images: ready.filter(i => i.mature).map(i => i.path),
          images: ready.map(i => i.path),
          hashes: ready.map(i => i.hash || ''),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Something went wrong. Please try again.'); return }
      onDone()
    } catch {
      setErr('Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      <div style={{ ...lbl, color: GOLD }}>YOUR ENTRY</div>
      <h2 style={{ fontFamily: anton, fontSize: 'clamp(30px, 5vw, 44px)', margin: '0 0 28px', letterSpacing: '0.02em' }}>SUBMIT YOUR SERIES</h2>

      <div style={{ border: LINE, padding: '16px 18px', marginBottom: 28, background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ ...lbl, color: GOLD }}>TO QUALIFY</span>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.65)' }}>
          <li>{rolling ? 'Any shoot at Made Kulture. Newer work is more likely to be picked' : `New work: shot on this year's ${setName || 'set'}, during this open call. Nothing from previous years`}</li>
          <li>Already posted it? That's fine. Send us the full-resolution files</li>
          <li>One series: {OPEN_CALL_MIN_IMAGES}–{maxImages} images from the same shoot</li>
          <li>Full resolution, at least {OPEN_CALL_MIN_EDGE}px on the long side. No screenshots</li>
          <li>No watermarks, logos, text, borders or collages</li>
          <li>{setName ? `${setName} recognisable in most frames` : 'Shot on a Made Kulture set'}</li>
          <li>Photographer and everyone pictured credited</li>
        </ul>
        <a href="/submissions/rules" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, color: GOLD }}>Full rules ↗</a>
      </div>

      <div style={{ marginBottom: 34 }}>
        <span style={lbl}>IMAGES ({imgs.length}/{maxImages})</span>
        <p style={help}>{OPEN_CALL_MIN_IMAGES}–{maxImages} finished frames, in the order you want them seen. The first one is your cover. Artistic nudity is allowed: tap <b>18+</b> on every frame that has it. Those frames are only shown to voters who confirm they&rsquo;re 18+, and never on the website, kiosks, Instagram or email. At least {OPEN_CALL_MIN_IMAGES} frames must be free of nudity.</p>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {imgs.map((im, i) => (
            <div key={im.key} style={{ position: 'relative', aspectRatio: '4 / 5', background: '#111', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: im.path ? 1 : 0.4 }} />
              {i === 0 && <span style={{ position: 'absolute', top: 6, left: 6, fontFamily: mono, fontSize: 9, letterSpacing: '0.15em', background: GOLD, color: '#000', padding: '3px 6px' }}>COVER</span>}
              <button type="button" onClick={() => setImgs(cur => cur.map(x => x.key === im.key ? { ...x, mature: !x.mature } : x))} aria-pressed={!!im.mature}
                style={{ position: 'absolute', top: 6, right: 6, fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', padding: '4px 6px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.6)', background: im.mature ? '#ff8a80' : 'rgba(0,0,0,0.55)', color: im.mature ? '#000' : '#fff' }}>
                {im.mature ? '18+ ✓' : '18+'}
              </button>
              {!im.path && !im.error && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: mono, fontSize: 10, letterSpacing: '0.15em' }}>UPLOADING…</span>}
              {im.error && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12, color: '#ff8a80', textAlign: 'center', padding: 8 }}>{im.error}</span>}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.6)' }}>
                <button type="button" onClick={() => move(i, -1)} style={tiny} aria-label="Move earlier">←</button>
                <button type="button" onClick={() => setImgs(cur => cur.filter(x => x.key !== im.key))} style={tiny} aria-label="Remove">✕</button>
                <button type="button" onClick={() => move(i, 1)} style={tiny} aria-label="Move later">→</button>
              </div>
            </div>
          ))}
          {imgs.length < maxImages && (
            <button type="button" onClick={() => inputRef.current?.click()}
              style={{ aspectRatio: '4 / 5', border: '1px dashed rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontFamily: mono, fontSize: 11, letterSpacing: '0.14em', cursor: 'pointer' }}>
              + ADD IMAGES
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 26 }}>
        <div><span style={lbl}>SERIES TITLE</span><input name="title" required maxLength={120} style={field} placeholder="What do you call it?" /></div>
        <div><span style={lbl}>SHOOT DATE</span><input name="shoot_date" type="date" required style={field} /></div>
        <div><span style={lbl}>PHOTOGRAPHER</span><input name="photographer" required maxLength={80} style={field} placeholder="Name for the byline" /></div>
        <div><span style={lbl}>PHOTOGRAPHER INSTAGRAM</span><input name="photographer_ig" maxLength={40} style={field} placeholder="@handle" /></div>
      </div>

      <div style={{ marginBottom: 26 }}>
        <span style={lbl}>CREDITS</span>
        <p style={help}>Everyone who made it: model, MUA, stylist, set design, assistants. Add their @handle: if the series wins or is featured, every credited directory member gets a Featured Editorial badge on their profile.{!rolling && ' Submitting for a team? Agree who submits first. The prize goes to the person who submits.'}</p>
        {credits.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 1fr) minmax(120px, 1.4fr) minmax(110px, 1.2fr) 40px', gap: 6, marginBottom: 6 }}>
            <input value={c.role} onChange={e => setCredits(cs => cs.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role" style={field} />
            <input value={c.name} onChange={e => setCredits(cs => cs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" style={field} />
            <input value={c.handle} onChange={e => setCredits(cs => cs.map((x, j) => j === i ? { ...x, handle: e.target.value } : x))} placeholder="@handle" style={field} />
            <button type="button" onClick={() => setCredits(cs => cs.filter((_, j) => j !== i))} style={{ ...field, padding: 0, cursor: 'pointer' }} aria-label="Remove credit">✕</button>
          </div>
        ))}
        {credits.length < OPEN_CALL_MAX_CREDITS && (
          <button type="button" onClick={() => setCredits(cs => [...cs, { role: '', name: '', handle: '' }])} style={{ ...btnGhost, padding: '10px 14px', fontSize: 10.5 }}>+ ADD CREDIT</button>
        )}
      </div>

      <div style={{ marginBottom: 26 }}>
        <span style={lbl}>THE IDEA (OPTIONAL)</span>
        <textarea name="note" maxLength={1500} rows={4} style={{ ...field, resize: 'vertical' }} placeholder="The concept, the story, anything you want us to know." />
      </div>


      <div style={{ borderTop: LINE, paddingTop: 24, marginBottom: 26 }}>
        <span style={lbl}>CONFIRM</span>
        <Check consents={consents} setConsents={setConsents} k="shotHere">{setName
          ? <>These images were shot during a <b>booked session on {setName}</b> at Made Kulture (by me or someone on my team). They&rsquo;re real photographs, not AI-generated; normal retouching is fine.</>
          : <>These images were shot at Made Kulture. They&rsquo;re real photographs, not AI-generated; normal retouching is fine.</>}</Check>
        <Check consents={consents} setConsents={setConsents} k="rights">I took these images or have the photographer&rsquo;s permission to submit them, and everyone credited agreed to be submitted.</Check>
        <Check consents={consents} setConsents={setConsents} k="adults">Everyone pictured is 18 or older.</Check>
        <Check consents={consents} setConsents={setConsents} k="feature">I agree to the <a href="/submissions/rules" target="_blank" rel="noreferrer" style={{ color: GOLD }}>submission rules</a>. If it&rsquo;s picked, Made Kulture may show this series, with credits, on madekulture.com, the studio kiosks, Instagram and email{setName ? ', and to directory members for the vote' : ''}.</Check>
      </div>

      {err && <p style={{ color: '#ff8a80', fontSize: 14, margin: '0 0 16px' }}>{err}</p>}
      <button type="submit" disabled={busy || uploading > 0} style={{ ...btnPrimary, opacity: busy || uploading > 0 ? 0.5 : 1 }}>
        {busy ? 'SUBMITTING…' : uploading > 0 ? 'UPLOADING…' : 'SUBMIT MY SERIES'}
      </button>
    </form>
  )
}

type Consents = { shotHere: boolean; rights: boolean; adults: boolean; feature: boolean }
function Check({ k, consents, setConsents, children }: { k: keyof Consents; consents: Consents; setConsents: React.Dispatch<React.SetStateAction<Consents>>; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, marginBottom: 12, cursor: 'pointer' }}>
      <input type="checkbox" checked={consents[k]} onChange={e => setConsents(c => ({ ...c, [k]: e.target.checked }))} style={{ marginTop: 4, accentColor: GOLD, width: 16, height: 16, flexShrink: 0 }} />
      <span>{children}</span>
    </label>
  )
}

// 64-bit difference hash (migration 152): 9x8 greyscale, each bit = is this
// pixel brighter than its right neighbour. Survives resizing and re-encoding,
// so the same frame submitted twice by two team members hashes a few bits apart.
async function dHash(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas'); c.width = 9; c.height = 8
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, 9, 8)
  const d = ctx.getImageData(0, 0, 9, 8).data
  const g = (x: number, y: number) => { const i = (y * 9 + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 }
  let hex = ''
  for (let y = 0; y < 8; y++) {
    let byte = 0
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (g(x, y) > g(x + 1, y) ? 1 : 0)
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

// Long edge of an image file in px, or 0 if the browser can't read it (HEIC on
// some browsers) — unreadable files are let through and reviewed by hand.
async function longEdge(file: File): Promise<number> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    return Math.max(img.naturalWidth, img.naturalHeight)
  } catch { return 0 } finally { URL.revokeObjectURL(url) }
}

const tiny: React.CSSProperties = { background: 'transparent', border: 'none', color: '#fff', padding: '6px 10px', cursor: 'pointer', fontSize: 13 }

function FinePrint({ title, setName, closes, rolling }: { title: string; setName: string | null; closes: string | null; rolling: boolean }) {
  const li: React.CSSProperties = { fontSize: 13.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 6 }
  if (rolling || !closes) return (
    <div style={{ marginTop: 56, borderTop: LINE, paddingTop: 28, maxWidth: 760 }}>
      <span style={lbl}>THE FINE PRINT</span>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        <li style={li}>Open to Made Kulture members, for new work shot at the studio. One series under review at a time. <a href="/submissions/rules" style={{ color: GOLD }}>Full rules</a>.</li>
        <li style={li}>Every series is reviewed by hand. Nothing is shown publicly unless we pick it, and featured work is always credited.</li>
        <li style={li}>You keep the rights to your work.</li>
        <li style={li}>Shooting on one of our limited-run sets? Check its own open call: those come with a vote and a prize.</li>
      </ul>
    </div>
  )
  return (
    <div style={{ marginTop: 56, borderTop: LINE, paddingTop: 28, maxWidth: 760 }}>
      <span style={lbl}>THE FINE PRINT</span>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        <li style={li}>Open to Made Kulture members. One entry per member; withdraw and resubmit any time before {closes}.</li>
        <li style={li}>Work must be shot in {setName || 'the set'} for this open call.</li>
        <li style={li}>Every entry is reviewed by hand. Nothing is shown publicly unless it&rsquo;s shortlisted.</li>
        <li style={li}>Shortlisted series go to a vote by listed directory members, one vote each. The studio confirms the final result.</li>
        <li style={li}>You keep the rights to your work. Featured work is always credited. <a href="/submissions/rules" style={{ color: GOLD }}>Full rules</a>.</li>
      </ul>
    </div>
  )
}
