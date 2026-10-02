'use client'
// The blurred "who's here" wall behind the members-only lock.
// ⚠️ Built from the STUDIO's own public set photos, never members' portfolio
// images: a blurred <img> still ships the full-resolution file to the browser,
// and members agreed to be seen by members, not the public.
const TILES = ['set-c', 'vintage', 'concrete', 'set-a', 'cottage', 'watering-hole', 'set-b', 'studio-one']

export default function DirectoryWall({ label = 'Members only', line = 'Join free to see who’s here' }: { label?: string; line?: string }) {
  const tiles = [...TILES, ...TILES, ...TILES].slice(0, 24)
  return (
    <div style={{ position: 'relative', overflow: 'hidden', minHeight: 360, height: '100%', background: '#0b0b0b' }}>
      <div aria-hidden style={{ position: 'absolute', inset: -24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, filter: 'blur(14px) saturate(0.85)', opacity: 0.8 }}>
        {tiles.map((t, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={`/images/sets/${t}.webp`} alt="" loading="lazy" style={{ width: '100%', aspectRatio: i % 3 === 0 ? '3/4' : i % 3 === 1 ? '4/5' : '1/1', objectFit: 'cover', borderRadius: 4, display: 'block' }} />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', background: 'radial-gradient(ellipse at center, rgba(8,8,8,0.35), rgba(8,8,8,0.88))' }}>
        <div className="label" style={{ color: 'rgba(255,255,255,0.7)' }}>{label.toUpperCase()}</div>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 32, lineHeight: 1, color: '#fff', textTransform: 'uppercase', maxWidth: 360 }}>{line}</div>
      </div>
    </div>
  )
}
