'use client'
// PORTAL — the guest's phone side of the set tablet (2026-09-29).
// Reached by scanning the QR on the tablet. A small hub: the mood board is the
// first feature; later ones (tethered shots) become more sections here.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface Item { id: string; kind: 'pin' | 'upload'; src: string }

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
  const [view, setView] = useState<'home' | 'mood'>('home')
  useEffect(() => {
    const sync = () => setView(window.location.hash === '#mood' ? 'mood' : 'home')
    sync(); window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  const open = (v: 'home' | 'mood') => { window.location.hash = v === 'home' ? '' : v; setView(v); setMsg(null) }

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
