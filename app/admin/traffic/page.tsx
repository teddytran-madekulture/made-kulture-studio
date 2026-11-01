'use client'
import { useEffect, useState } from 'react'

// Admin → Insights → Traffic: who visits the public site and the store apps,
// which pages they look at, where they came from, and which visits booked.
// Data: /api/admin/traffic (page_views, migration 182). Your own visits while
// signed in to admin are not counted.

type Data = {
  days: number
  trackingSince: string | null
  summary: { visitors: number; visits: number; pageViews: number; pagesPerVisit: number; members: number; bookings: number; bookedVisitors: number; appVisitors: number }
  perDay: { day: string; visitors: number; views: number; bookings: number }[]
  pages: { path: string; label: string; views: number; visitors: number }[]
  sources: { name: string; visits: number; visitors: number; bookings: number }[]
  platforms: { key: string; visitors: number }[]
  devices: { key: string; visitors: number }[]
  cities: { key: string; visitors: number }[]
}

const GOLD = '#e6c07a'
const card: React.CSSProperties = { background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '26px 28px' }
const h2: React.CSSProperties = { fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', margin: '0 0 6px', fontWeight: 600 }
const hint: React.CSSProperties = { fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: '0 0 20px', lineHeight: 1.55, maxWidth: 560 }
const th: React.CSSProperties = { textAlign: 'left', fontFamily: 'Inter', fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', fontWeight: 600, padding: '0 12px 10px 0', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontFamily: 'Inter', fontSize: 13, color: '#fff', padding: '11px 12px 11px 0', borderTop: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'middle' }
const num: React.CSSProperties = { ...td, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, textAlign: 'right' }
const numTh: React.CSSProperties = { ...th, textAlign: 'right' }
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')
const PLATFORM: Record<string, string> = { web: 'Website', ios: 'iPhone app', android: 'Android app' }
const DEVICE: Record<string, string> = { mobile: 'Phone', desktop: 'Computer', tablet: 'Tablet' }

function Split({ title, rows, names }: { title: string; rows: { key: string; visitors: number }[]; names?: Record<string, string> }) {
  const total = rows.reduce((a, r) => a + r.visitors, 0)
  return (
    <div style={card}>
      <div style={{ ...h2, marginBottom: 18 }}>{title}</div>
      {total === 0 ? <div style={hint}>Nothing yet.</div> : rows.map(r => (
        <div key={r.key} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter', fontSize: 13, marginBottom: 6 }}>
            <span>{names?.[r.key] ?? r.key}</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>{r.visitors} · {pct(r.visitors, total)}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
            <div style={{ width: `${(r.visitors / total) * 100}%`, height: '100%', background: GOLD, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TrafficPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true); setError('')
    fetch(`/api/admin/traffic?days=${days}`, { cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(r.status === 401 ? 'Please sign in to admin.' : (d.error ?? 'Could not load.')); setData(null) }
        else setData(d)
        setLoading(false)
      })
      .catch(() => { setError('Could not load.'); setLoading(false) })
  }, [days])

  const s = data?.summary
  const tiles: [string, number | string, string?][] = s ? [
    ['Visitors', s.visitors, `${s.members} signed-in members`],
    ['Visits', s.visits, `${s.pagesPerVisit} pages per visit`],
    ['Page views', s.pageViews],
    ['Bookings from visits', s.bookings, `${pct(s.bookedVisitors, s.visitors)} of visitors booked`],
  ] : []
  const series = (data?.perDay ?? []).slice(-90)
  const maxDay = Math.max(1, ...series.map(d => d.visitors))

  return (
    <div style={{ color: '#fff', maxWidth: 1400, padding: '28px 8px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '0 0 8px', lineHeight: 1.1 }}>TRAFFIC</h1>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            Visitors to madekulture.com and the store apps. No names or emails are logged, and your own visits while signed in to admin don&rsquo;t count.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90, 365].map(d => (
            <button key={d} type="button" onClick={() => setDays(d)}
              style={{ padding: '8px 14px', borderRadius: 4, fontFamily: 'Inter', fontSize: 12, cursor: 'pointer', background: days === d ? '#fff' : 'transparent', color: days === d ? '#080808' : 'rgba(255,255,255,0.6)', border: `1px solid ${days === d ? '#fff' : 'rgba(255,255,255,0.2)'}` }}>
              {d === 365 ? '1 year' : `${d} days`}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ ...card, borderColor: 'rgba(255,80,80,0.35)', color: '#ff8a8a', fontFamily: 'Inter', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}

      {data && s && !loading && (
        <>
          {!data.trackingSince && (
            <div style={{ ...card, borderColor: 'rgba(230,192,122,0.35)', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 24, lineHeight: 1.5 }}>
              <strong style={{ color: GOLD }}>Tracking just started.</strong> Numbers fill in as people visit the site. Nothing before today was recorded.
            </div>
          )}

          <div className="cm-tiles" style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
            {tiles.map(([label, value, sub]) => (
              <div key={label} style={card}>
                <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, lineHeight: 1 }}>{value ?? 0}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>{label}</div>
                {sub && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ ...card, marginBottom: 24 }}>
            <div style={h2}>VISITORS PER DAY</div>
            <p style={hint}>Houston days. A gold dot means a booking came from a visit that day.</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {series.map(d => (
                <div key={d.day} title={`${d.day}: ${d.visitors} visitors · ${d.views} page views${d.bookings ? ` · ${d.bookings} booked` : ''}`}
                  style={{ flex: 1, maxWidth: 28, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {d.bookings > 0 && <div style={{ width: 6, height: 6, borderRadius: 3, background: GOLD, marginBottom: 4 }} />}
                  <div style={{ width: '100%', height: d.visitors ? `${Math.max(4, (d.visitors / maxDay) * 85)}%` : 2, background: d.visitors ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.08)', borderRadius: '2px 2px 0 0' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
              <span>{series[0]?.day.slice(5)}</span><span>peak {maxDay}/day</span><span>today</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24, marginBottom: 24 }}>
            <div style={card}>
              <div style={h2}>WHERE VISITORS COME FROM</div>
              <p style={hint}>Counted once per visit, from the page they landed on. Links with ?utm_source= or ?ref= show by name.</p>
              {data.sources.length === 0 ? <div style={hint}>Nothing yet.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>SOURCE</th><th style={numTh}>VISITS</th><th style={numTh}>PEOPLE</th><th style={numTh}>BOOKED</th></tr></thead>
                  <tbody>{data.sources.map(r => (
                    <tr key={r.name}><td style={td}>{r.name}</td><td style={num}>{r.visits}</td><td style={num}>{r.visitors}</td>
                      <td style={{ ...num, color: r.bookings ? GOLD : 'rgba(255,255,255,0.35)' }}>{r.bookings}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>

            <div style={card}>
              <div style={h2}>TOP PAGES</div>
              <p style={hint}>Private links (check-in, manage, pay) are grouped, never shown with their code.</p>
              {data.pages.length === 0 ? <div style={hint}>Nothing yet.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>PAGE</th><th style={numTh}>VIEWS</th><th style={numTh}>PEOPLE</th></tr></thead>
                  <tbody>{data.pages.map(r => (
                    <tr key={r.path}><td style={td} title={r.path}>{r.label}</td><td style={num}>{r.views}</td><td style={num}>{r.visitors}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            <Split title="APP VS WEBSITE" rows={data.platforms} names={PLATFORM} />
            <Split title="DEVICE" rows={data.devices} names={DEVICE} />
            <Split title="TOP CITIES" rows={data.cities} />
          </div>
        </>
      )}
    </div>
  )
}
