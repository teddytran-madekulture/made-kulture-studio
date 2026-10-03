'use client'
// /projector/upload?c=<code> — the phone side of the wall projector.
import { useEffect, useRef, useState } from 'react'

const C = { bg: '#0d0d0d', card: '#161616', line: 'rgba(201,178,126,0.25)', champ: '#c9b27e', text: '#eee', dim: '#999' }

// ≤2400px long edge JPEG: sharp on a 1080p projector, tiny to upload.
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', 0.9))
  } finally { URL.revokeObjectURL(url) }
}

export default function ProjectorUpload() {
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { setCode(new URLSearchParams(window.location.search).get('c')) }, [])

  // Video: PUT straight to storage on a signed URL (too big for the site's
  // 4.5 MB upload cap). XHR rather than fetch so we can show progress.
  const sendVideo = async (file: File) => {
    const start = await fetch(`/api/projector/video?c=${encodeURIComponent(code!)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: file.type, size: file.size }),
    })
    const d = await start.json().catch(() => ({}))
    if (!start.ok) { setMsg(d.error || 'Could not start the upload.'); return }
    setPreview(null); setVideoPreview(URL.createObjectURL(file))
    const ok = await new Promise<boolean>(res => {
      const x = new XMLHttpRequest()
      x.open('PUT', d.uploadUrl)
      x.setRequestHeader('Content-Type', file.type)
      x.upload.onprogress = e => { if (e.lengthComputable) setMsg(`Uploading… ${Math.round(e.loaded / e.total * 100)}%`) }
      x.onload = () => res(x.status >= 200 && x.status < 300)
      x.onerror = () => res(false)
      x.send(file)
    })
    if (!ok) { setMsg('Upload failed. Try again on Wi-Fi, or send a shorter clip.'); return }
    const fin = await fetch(`/api/projector/video?c=${encodeURIComponent(code!)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: d.name }),
    })
    setMsg(fin.ok ? 'On the wall — give it a few seconds.' : 'Uploaded, but something went wrong finishing up.')
  }

  const send = async (file: File) => {
    if (!code) return
    setBusy(true); setMsg(null)
    if (file.type.startsWith('video/')) {
      try { await sendVideo(file) } catch { setMsg('Upload failed.') }
      setBusy(false); if (input.current) input.current.value = ''
      return
    }
    try {
      const blob = await shrink(file)
      setVideoPreview(null); setPreview(URL.createObjectURL(blob))
      const fd = new FormData(); fd.append('file', blob, 'wall.jpg')
      const r = await fetch(`/api/projector/upload?c=${encodeURIComponent(code)}`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? 'On the wall — give it a few seconds.' : (j.error || 'Upload failed.'))
    } catch { setMsg('Could not read that image. Try a JPG or PNG.') }
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  const clear = async () => {
    if (!code) return
    setBusy(true)
    const r = await fetch(`/api/projector/upload?c=${encodeURIComponent(code)}`, { method: 'DELETE' })
    setMsg(r.ok ? 'Wall cleared.' : 'Could not clear the wall.'); setPreview(null); setVideoPreview(null); setBusy(false)
  }

  const btn: React.CSSProperties = { width: '100%', padding: '16px 0', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '32px 20px' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div style={{ color: C.champ, letterSpacing: '0.3em', fontSize: 12 }}>MADE KULTURE</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 30, margin: '10px 0 6px' }}>Projector</h1>
        <p style={{ color: C.dim, marginTop: 0, lineHeight: 1.5 }}>Pick an image or a video and it goes straight onto the projector wall. Wide (landscape) fills it best. Videos loop with no sound, up to 49 MB.</p>
        {!code ? <p>This link isn’t valid — scan the QR on the wall again.</p> : (
          <>
            <input ref={input} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) send(f) }} />
            <button disabled={busy} onClick={() => input.current?.click()} style={{ ...btn, background: C.champ, color: '#111', marginTop: 12, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'SENDING…' : 'CHOOSE IMAGE OR VIDEO'}
            </button>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" style={{ width: '100%', marginTop: 18, borderRadius: 8, border: `1px solid ${C.line}` }} />
            )}
            {videoPreview && <video src={videoPreview} muted playsInline autoPlay loop style={{ width: '100%', marginTop: 18, borderRadius: 8, border: `1px solid ${C.line}` }} />}
            {msg && <p style={{ color: C.champ, marginTop: 14 }}>{msg}</p>}
            <button disabled={busy} onClick={clear} style={{ ...btn, background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, marginTop: 24 }}>CLEAR THE WALL</button>
          </>
        )}
      </div>
    </div>
  )
}
