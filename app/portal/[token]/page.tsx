'use client'
// PORTAL — the guest's phone side of the set tablet (2026-09-29).
// Reached by scanning the QR on the tablet. A small hub: the mood board is the
// first feature; later ones (tethered shots) become more sections here.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { POSE_CATEGORIES } from '@/lib/pose-categories'
import { shrinkImage } from '@/lib/shrink-image'

interface Item { id: string; kind: 'pin' | 'upload'; src: string }
interface Pose { id: string; src: string; credit: string | null; setName: string | null }
interface PoseCat { key: string; label: string; count: number; cover: string | null }

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', fg: '#f4f1ea', dim: 'rgba(244,241,234,0.5)', champ: '#c9b27e' }
const btn: React.CSSProperties = { border: 'none', padding: '14px 18px', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', cursor: 'pointer', borderRadius: 10 }
const gold: React.CSSProperties = { ...btn, background: 'linear-gradient(135deg,#d7c08b 0%,#b59a63 55%,#9c8250 100%)', color: '#0b0b0d' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', border: `1px solid ${C.line}`, color: C.dim, fontWeight: 600 }

// Shrink a photo on the phone before upload: ≤1600px long edge, JPEG. Keeps
// every upload tiny (the server rejects > 4 MB) and fast on studio Wi-Fi.
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', 0.84))
  } finally { URL.revokeObjectURL(url) }
}

export default function PortalPage() {
  const { token } = useParams() as { token: string }
  const [live, setLive] = useState<boolean | null>(null)
  const [setName, setSetName] = useState('')
  const [endISO, setEndISO] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [maxItems, setMaxItems] = useState(60)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [invalid, setInvalid] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Which Portal feature is open. Kept in the URL hash so the phone's own BACK
  // button returns to the Portal home instead of leaving the page.
  const [view, setView] = useState<'home' | 'mood' | 'poses'>('home')
  useEffect(() => {
    const sync = () => setView(window.location.hash === '#mood' ? 'mood' : window.location.hash === '#poses' ? 'poses' : 'home')
    sync(); window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  const open = (v: 'home' | 'mood' | 'poses') => { window.location.hash = v === 'home' ? '' : v; setView(v); setMsg(null) }

  // ── POSE GUIDE ────────────────────────────────────────────────────────────
  const [cats, setCats] = useState<PoseCat[] | null>(null)
  const [cat, setCat] = useState<string | null>(null)
  const [poses, setPoses] = useState<Pose[]>([])
  const [pose, setPose] = useState<Pose | null>(null)
  const [wallNote, setWallNote] = useState('')
  const [share, setShare] = useState(false)
  const [shareCat, setShareCat] = useState(POSE_CATEGORIES[0].key)
  const [shareCredit, setShareCredit] = useState('')
  const [okRights, setOkRights] = useState(false)
  const [okPeople, setOkPeople] = useState(false)
  const shareRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (view !== 'poses' || cats) return
    fetch('/api/poses', { cache: 'no-store' }).then(r => r.json()).then(d => setCats(d.categories || [])).catch(() => setCats([]))
  }, [view, cats])
  const openCat = async (key: string) => {
    setCat(key); setPoses([]); setPose(null)
    const d = await fetch(`/api/poses?category=${encodeURIComponent(key)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}))
    setPoses(d.poses || [])
  }
  const toWall = async (p: Pose) => {
    setWallNote('Sending…')
    const { ok, d } = await post({ action: 'wall', poseId: p.id })
    setWallNote(ok ? 'Sent! It appears on the set screen while PORTAL is open there.' : (d.error || 'Couldn’t reach the screen.'))
  }
  const sharePose = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setBusy('share'); setMsg(null)
    try {
      const blob = await shrinkImage(f)
      const fd = new FormData()
      fd.append('file', blob, 'pose.jpg'); fd.append('category', shareCat); fd.append('credit', shareCredit)
      fd.append('rights', okRights ? '1' : '0'); fd.append('people', okPeople ? '1' : '0')
      const r = await fetch(`/api/portal/${token}/pose`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setMsg({ text: 'Thank you! We’ll review it and add it to the guide.' }); setShare(false); setOkRights(false); setOkPeople(false) }
      else setMsg({ text: d.error || 'Couldn’t send that photo.', bad: true })
    } catch { setMsg({ text: 'That photo couldn’t be read.', bad: true }) }
    if (shareRef.current) shareRef.current.value = ''
    setBusy(null)
  }

  const load = useCallback(async () => {
    const r = await fetch(`/api/portal/${token}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setInvalid(true); return }
    setLive(!!d.live); setSetName(d.setName || ''); setEndISO(d.endISO); setItems(d.items || []); setMaxItems(d.maxItems || 60)
  }, [token])
  useEffect(() => { load() }, [load])

  const post = async (body: any) => {
    const r = await fetch(`/api/portal/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (r.status === 410) setLive(false)
    return { ok: r.ok, d }
  }

  const addPinterest = async () => {
    if (!link.trim()) return
    setBusy('pin'); setMsg(null)
    const { ok, d } = await post({ action: 'pinterest', url: link })
    if (ok) { setItems(d.items || []); setLink(''); setMsg({ text: `Added ${d.added} picture${d.added === 1 ? '' : 's'} — they’re on the wall now.` }) }
    else setMsg({ text: d.error || 'Couldn’t add that board.', bad: true })
    setBusy(null)
  }

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setMsg(null)
    let done = 0, failed = ''
    for (const f of Array.from(files)) {
      setBusy(`Uploading ${done + 1} of ${files.length}…`)
      try {
        const blob = await shrink(f)
        const fd = new FormData(); fd.append('file', blob, 'photo.jpg')
        const r = await fetch(`/api/portal/${token}/upload`, { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { failed = d.error || 'Upload failed.'; if (r.status === 410) setLive(false); break }
        done++
      } catch { failed = 'One of those photos couldn’t be read.'; break }
    }
    if (fileRef.current) fileRef.current.value = ''
    await load()
    setBusy(null)
    setMsg(failed ? { text: `${done ? `${done} uploaded. ` : ''}${failed}`, bad: true } : { text: `${done} photo${done === 1 ? '' : 's'} added — they’re on the wall now.` })
  }

  const remove = async (id: string) => {
    setBusy(id)
    const { ok, d } = await post({ action: 'delete', id })
    if (ok) setItems(d.items || [])
    setBusy(null)
  }
  const clearAll = async () => {
    if (!confirm('Remove every picture from the board?')) return
    setBusy('clear')
    const { ok } = await post({ action: 'clear' })
    if (ok) setItems([])
    setBusy(null)
  }

  const until = endISO ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(endISO)) : ''

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.fg, fontFamily: 'Inter, sans-serif', padding: '28px 16px 60px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.3em', color: C.champ }}>MADE KULTURE</div>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.04em', lineHeight: 1.1, marginTop: 6 }}>PORTAL</div>
        {setName && <div style={{ fontSize: 14, color: C.dim, marginTop: 4 }}>{setName}{live && until ? ` · until ${until}` : ''}</div>}

        {invalid && <p style={{ marginTop: 28, color: C.dim, lineHeight: 1.6 }}>This link isn’t valid. Scan the code on your set’s tablet again.</p>}
        {live === false && !invalid && <p style={{ marginTop: 28, color: C.dim, lineHeight: 1.6 }}>This session has ended, and its board has been cleared. Thanks for shooting with us.</p>}

        {live && view === 'home' && (
          // PORTAL HOME — one tile per feature. A new feature = a new tile here,
          // a new tile on the tablet's Portal screen, and its own section below.
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 28 }}>
            <button onClick={() => open('mood')}
              style={{ textAlign: 'left', background: C.card, border: `1px solid rgba(201,178,126,0.35)`, borderRadius: 14, padding: '18px 16px', color: C.fg, cursor: 'pointer', fontFamily: 'Inter, sans-serif', minHeight: 130, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.16em' }}>MOOD BOARD</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 4, lineHeight: 1.4 }}>
                {items.length ? `${items.length} on the wall` : 'Pinterest or your photos, on the set screen'}
              </div>
            </button>
            <button onClick={() => open('poses')}
              style={{ textAlign: 'left', background: C.card, border: `1px solid rgba(201,178,126,0.35)`, borderRadius: 14, padding: '18px 16px', color: C.fg, cursor: 'pointer', fontFamily: 'Inter, sans-serif', minHeight: 130, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.16em' }}>POSE GUIDE</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 4, lineHeight: 1.4 }}>Ideas by category — send one to the wall</div>
            </button>
          </div>
        )}

        {live && view === 'poses' && (
          <section style={{ marginTop: 28, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
            <button onClick={() => { if (cat) { setCat(null); setPose(null) } else open('home') }} style={{ background: 'none', border: 'none', color: C.champ, fontSize: 12, letterSpacing: '0.14em', padding: 0, marginBottom: 12, cursor: 'pointer' }}>
              {cat ? '← CATEGORIES' : '← PORTAL'}
            </button>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em' }}>{cat ? (POSE_CATEGORIES.find(c => c.key === cat)?.label ?? '').toUpperCase() : 'POSE GUIDE'}</div>
            {msg && <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, color: msg.bad ? '#ff8f8f' : '#9fe0b4' }}>{msg.text}</div>}

            {!cat && (
              <>
                <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, margin: '6px 0 16px' }}>Tap a pose to see it big, then put it up on the set screen.</p>
                {!cats ? <div style={{ color: C.dim, fontSize: 13 }}>Loading…</div>
                  : cats.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>No poses yet — check back soon.</div>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {cats.map(c => (
                        <button key={c.key} onClick={() => openCat(c.key)}
                          style={{ position: 'relative', height: 130, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.line}`, padding: 0, cursor: 'pointer',
                            background: c.cover ? `center / cover no-repeat url("${c.cover}")` : '#0d0d0f' }}>
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.8) 100%)' }} />
                          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8, textAlign: 'left', color: '#fff' }}>
                            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em' }}>{c.label.toUpperCase()}</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{c.count}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                {/* Guest contributions — reviewed before anyone else sees them. */}
                <div style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
                  {!share ? (
                    <button onClick={() => setShare(true)} style={{ ...ghost, width: '100%', color: C.fg }}>SHARE A POSE FROM YOUR SHOOT</button>
                  ) : (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', marginBottom: 6 }}>SHARE A POSE</div>
                      <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.5, margin: '0 0 12px' }}>We review every photo before it’s added. If it’s picked, it’s credited to you.</p>
                      <select value={shareCat} onChange={e => setShareCat(e.target.value)}
                        style={{ width: '100%', background: '#0d0d0f', color: C.fg, border: `1px solid ${C.line}`, padding: '12px 10px', borderRadius: 10, fontSize: 14, colorScheme: 'dark', marginBottom: 8 }}>
                        {POSE_CATEGORIES.map(c => <option key={c.key} value={c.key} style={{ background: '#0d0d0f', color: '#fff' }}>{c.label}</option>)}
                      </select>
                      <input value={shareCredit} onChange={e => setShareCredit(e.target.value)} placeholder="Credit as (e.g. @yourhandle)" autoCapitalize="none"
                        style={{ width: '100%', boxSizing: 'border-box', background: '#0d0d0f', color: C.fg, border: `1px solid ${C.line}`, padding: '12px 10px', borderRadius: 10, fontSize: 14, marginBottom: 10 }} />
                      <label style={{ display: 'flex', gap: 8, fontSize: 13, color: C.fg, lineHeight: 1.45, marginBottom: 8 }}>
                        <input type="checkbox" checked={okRights} onChange={e => setOkRights(e.target.checked)} /> I took this photo or have the rights to share it.
                      </label>
                      <label style={{ display: 'flex', gap: 8, fontSize: 13, color: C.fg, lineHeight: 1.45, marginBottom: 12 }}>
                        <input type="checkbox" checked={okPeople} onChange={e => setOkPeople(e.target.checked)} /> Everyone in the photo agreed to it being shared.
                      </label>
                      <input ref={shareRef} type="file" accept="image/*" hidden onChange={e => sharePose(e.target.files)} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={!okRights || !okPeople || !!busy} onClick={() => shareRef.current?.click()} style={{ ...gold, flex: 1, opacity: !okRights || !okPeople || busy ? 0.5 : 1 }}>
                          {busy === 'share' ? 'SENDING…' : 'CHOOSE PHOTO'}
                        </button>
                        <button onClick={() => setShare(false)} style={ghost}>CANCEL</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {cat && (
              poses.length === 0 ? <div style={{ color: C.dim, fontSize: 13, marginTop: 14 }}>Loading…</div> : (
                <div style={{ columnCount: 2, columnGap: 6, marginTop: 14 }}>
                  {poses.map(p => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={p.src} alt="" onClick={() => { setPose(p); setWallNote('') }}
                      style={{ width: '100%', display: 'block', marginBottom: 6, borderRadius: 6, breakInside: 'avoid' as any }} />
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {pose && (
          <div onClick={() => setPose(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pose.src} alt="" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }} />
            <div style={{ color: C.dim, fontSize: 12, marginTop: 10, textAlign: 'center' }}>{pose.credit}{pose.setName ? ` · Shot in ${pose.setName}` : ''}</div>
            <button onClick={e => { e.stopPropagation(); toWall(pose) }} style={{ ...gold, marginTop: 16 }}>SHOW ON THE SET SCREEN</button>
            {wallNote && <div style={{ color: '#9fe0b4', fontSize: 12, marginTop: 10 }}>{wallNote}</div>}
            <div style={{ color: C.dim, fontSize: 11, marginTop: 14 }}>Tap anywhere to close</div>
          </div>
        )}

        {live && view === 'mood' && (
          <section style={{ marginTop: 28, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
            <button onClick={() => open('home')} style={{ background: 'none', border: 'none', color: C.champ, fontSize: 12, letterSpacing: '0.14em', padding: 0, marginBottom: 12, cursor: 'pointer' }}>← PORTAL</button>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em' }}>MOOD BOARD</div>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, margin: '6px 0 16px' }}>
              Your references on the set’s screen. Only for this session — it clears when your time ends.
            </p>

            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.14em', color: C.dim, marginBottom: 6 }}>PINTEREST BOARD LINK</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={link} onChange={e => setLink(e.target.value)} placeholder="pinterest.com/you/your-board" inputMode="url" autoCapitalize="none" autoCorrect="off"
                style={{ flex: 1, minWidth: 0, background: '#0d0d0f', border: `1px solid ${C.line}`, color: C.fg, padding: '13px 12px', fontSize: 15, borderRadius: 10, outline: 'none' }} />
              <button onClick={addPinterest} disabled={!!busy || !link.trim()} style={{ ...gold, opacity: busy || !link.trim() ? 0.5 : 1 }}>{busy === 'pin' ? '…' : 'ADD'}</button>
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>Public boards only. We show the board’s most recent pins.</div>

            <div style={{ margin: '18px 0 0' }}>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => upload(e.target.files)} />
              <button onClick={() => fileRef.current?.click()} disabled={!!busy} style={{ ...ghost, width: '100%', color: C.fg }}>
                {busy && busy.startsWith('Uploading') ? busy : 'UPLOAD PHOTOS FROM YOUR PHONE'}
              </button>
            </div>

            {msg && <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.5, color: msg.bad ? '#ff8f8f' : '#9fe0b4' }}>{msg.text}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '22px 0 10px' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim }}>ON THE WALL · {items.length}/{maxItems}</div>
              {items.length > 0 && <button onClick={clearAll} disabled={!!busy} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>Clear board</button>}
            </div>
            {items.length === 0 ? (
              <div style={{ fontSize: 13, color: C.dim, padding: '18px 0' }}>Nothing yet — add a board or some photos above.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {items.map(it => (
                  <div key={it.id} style={{ position: 'relative', aspectRatio: '1', background: '#000', borderRadius: 6, overflow: 'hidden', opacity: busy === it.id ? 0.4 : 1 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <button onClick={() => remove(it.id)} aria-label="Remove"
                      style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 16, lineHeight: '28px', cursor: 'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
