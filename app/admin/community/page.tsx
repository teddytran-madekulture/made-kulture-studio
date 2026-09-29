'use client'
import { useEffect, useState } from 'react'

// Admin → Community: how members use the directory, portfolios, messaging and
// castings. Data: /api/admin/community (events from migration 119 + real tables).

type Data = {
  days: number
  trackingSince: string | null
  summary: Record<string, number>
  funnel: { profilePairs: number; sawPortfolio: number; messaged: number }
  contactBreakdown: { what: string; count: number }[]
  topSearches: { query: string; kind: string; count: number; people: number; zero: number; lastResults: number | null }[]
  zeroSearches: { query: string; kind: string; count: number; people: number; zero: number }[]
  roles: { role: string; filters: number; listed: number }[]
  profiles: { id: string; name: string; avatar: string | null; views: number; viewers: number; sawPortfolio: number; photoOpens: number; deepestPhoto: number; contacts: number; messages: number; follows: number }[]
  castings: { id: string; title: string; author: string; status: string; comp: string; posted: string; viewers: number; applyClicks: number; interested: number; confirmed: number }[]
  activity: { day: string; activeMembers: number; events: number; messages: number }[]
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
const KIND: Record<string, string> = { people: 'Directory', role: 'Role list', casting: 'Castings' }
const WHAT: Record<string, string> = { message: 'Message', follow: 'Follow', unfollow: 'Unfollow', instagram: 'Instagram', email: 'Email', phone: 'Phone', link: 'Website / link', reel: 'Reel', invite: 'Invite to casting', other: 'Other' }

export default function CommunityPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true); setError('')
    fetch(`/api/admin/community?days=${days}`, { cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(r.status === 401 ? 'Please sign in to admin.' : (d.error ?? 'Could not load.')); setData(null) }
        else setData(d)
        setLoading(false)
      })
      .catch(() => { setError('Could not load.'); setLoading(false) })
  }, [days])

  const s = data?.summary ?? {}
  const tiles: [string, number | string, string?][] = data ? [
    ['Active members', s.activeMembers, `${s.listedCreatives} opted in to the directory`],
    ['Searches', s.searches],
    ['Profile views', s.profileViews],
    ['Portfolio photos opened', s.portfolioOpens],
    ['Messages sent', s.messagesSent, `${s.newConversations} new chats · ${pct(s.repliedConversations, s.newConversations)} got a reply`],
    ['New follows', s.newFollows],
    ['Castings posted', s.castingsPosted],
    ['Casting applications', s.castingApplications, `${s.castingConfirmed} confirmed`],
  ] : []
  const maxAct = Math.max(1, ...(data?.activity ?? []).map(a => a.activeMembers))
  // One slot per Houston day in the range, so a single active day is one bar,
  // not a slab across the whole card.
  const series = (() => {
    if (!data) return [] as { day: string; activeMembers: number; messages: number }[]
    const byDay = new Map(data.activity.map(a => [a.day, a]))
    const span = Math.min(data.days, 90)
    const out: { day: string; activeMembers: number; messages: number }[] = []
    for (let i = span - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      const a = byDay.get(day)
      out.push({ day, activeMembers: a?.activeMembers ?? 0, messages: a?.messages ?? 0 })
    }
    return out
  })()

  return (
    <div style={{ color: '#fff', maxWidth: 1400, padding: '28px 8px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '0 0 8px', lineHeight: 1.1 }}>COMMUNITY</h1>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            How members use the directory, portfolios, messages and castings. Signed-in members only; message content is never logged.
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

      {data && !loading && (
        <>
          {!data.trackingSince && (
            <div style={{ ...card, borderColor: 'rgba(230,192,122,0.35)', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 24, lineHeight: 1.5 }}>
              <strong style={{ color: GOLD }}>Tracking just started.</strong> Searches, profile views and portfolio activity fill in as members use the site. Messages, follows and castings below are already real.
            </div>
          )}

          {/* Summary tiles */}
          <div className="cm-tiles" style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
            {tiles.map(([label, value, sub]) => (
              <div key={label} style={card}>
                <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, lineHeight: 1 }}>{value ?? 0}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>{label}</div>
                {sub && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24, marginBottom: 24 }}>
            {/* Funnel */}
            <div style={card}>
              <div style={h2}>ARE PEOPLE LOOKING AT THE WORK?</div>
              <p style={hint}>Every time a member opened someone&apos;s profile: did they scroll to the portfolio, and did they hit Message?</p>
              {[
                ['Opened a profile', data.funnel.profilePairs],
                ['Scrolled to the portfolio', data.funnel.sawPortfolio],
                ['Clicked Message', data.funnel.messaged],
              ].map(([label, n], i) => {
                const w = data.funnel.profilePairs && (n as number) > 0 ? Math.max(2, ((n as number) / data.funnel.profilePairs) * 100) : 0
                return (
                  <div key={label as string} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 7 }}>
                      <span>{label}</span><span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{n as number}{i > 0 && ` · ${pct(n as number, data.funnel.profilePairs)}`}</span>
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
                      <div style={{ width: `${w}%`, height: '100%', background: i === 0 ? 'rgba(255,255,255,0.5)' : GOLD, borderRadius: 4, opacity: i === 2 ? 1 : 0.75 }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Activity */}
            <div style={card}>
              <div style={h2}>ACTIVE MEMBERS PER DAY</div>
              <p style={hint}>Members who searched, viewed, clicked or sent a message that day (Houston time).</p>
              {data.activity.length === 0 ? <div style={hint}>No activity yet.</div> : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    {series.map(a => (
                      <div key={a.day} title={`${a.day}: ${a.activeMembers} active · ${a.messages} messages`}
                        style={{ flex: 1, maxWidth: 28, height: a.activeMembers ? `${Math.max(6, (a.activeMembers / maxAct) * 100)}%` : 2, background: a.activeMembers ? GOLD : 'rgba(255,255,255,0.08)', opacity: 0.85, borderRadius: '2px 2px 0 0' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
                    <span>{series[0]?.day.slice(5)}</span><span>peak {maxAct}/day</span><span>today</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24, marginBottom: 24 }}>
            {/* Top searches */}
            <div style={card}>
              <div style={h2}>WHAT PEOPLE SEARCH FOR</div>
              <p style={hint}>Directory name searches, role-list searches and casting searches.</p>
              {data.topSearches.length === 0 ? <div style={hint}>No searches yet.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>SEARCH</th><th style={th}>WHERE</th><th style={numTh}>TIMES</th><th style={numTh}>PEOPLE</th><th style={numTh}>RESULTS</th></tr></thead>
                  <tbody>{data.topSearches.map(r => (
                    <tr key={r.kind + r.query}><td style={td}>{r.query}</td><td style={{ ...td, color: 'rgba(255,255,255,0.5)' }}>{KIND[r.kind] ?? r.kind}</td><td style={num}>{r.count}</td><td style={num}>{r.people}</td>
                      <td style={{ ...num, color: r.lastResults === 0 ? '#ff8a8a' : '#fff' }}>{r.lastResults ?? '—'}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>

            {/* Zero results */}
            <div style={card}>
              <div style={h2}>SEARCHES THAT FOUND NOBODY</div>
              <p style={hint}>What members wanted and the directory didn&apos;t have. These are the creatives worth recruiting.</p>
              {data.zeroSearches.length === 0 ? <div style={hint}>None yet. Every search found someone.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>SEARCH</th><th style={th}>WHERE</th><th style={numTh}>EMPTY TIMES</th><th style={numTh}>PEOPLE</th></tr></thead>
                  <tbody>{data.zeroSearches.map(r => (
                    <tr key={r.kind + r.query}><td style={{ ...td, color: '#ff8a8a' }}>{r.query}</td><td style={{ ...td, color: 'rgba(255,255,255,0.5)' }}>{KIND[r.kind] ?? r.kind}</td><td style={num}>{r.zero}</td><td style={num}>{r.people}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24, marginBottom: 24 }}>
            {/* Roles */}
            <div style={card}>
              <div style={h2}>ROLES: WANTED VS LISTED</div>
              <p style={hint}>How often each role was filtered for, next to how many listed creatives have it. High demand with few listed means a gap to fill.</p>
              {data.roles.length === 0 ? <div style={hint}>No role data yet.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>ROLE</th><th style={numTh}>FILTERED</th><th style={numTh}>LISTED</th></tr></thead>
                  <tbody>{data.roles.slice(0, 25).map(r => (
                    <tr key={r.role}><td style={td}>{r.role}</td><td style={num}>{r.filters}</td>
                      <td style={{ ...num, color: r.filters > 0 && r.listed === 0 ? '#ff8a8a' : '#fff' }}>{r.listed}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>

            {/* Contact breakdown */}
            <div style={card}>
              <div style={h2}>HOW PEOPLE REACH OUT</div>
              <p style={hint}>Clicks on profile buttons. Instagram and email clicks mean the conversation moved off the site.</p>
              {data.contactBreakdown.length === 0 ? <div style={hint}>No clicks yet.</div> : (() => {
                const max = Math.max(...data.contactBreakdown.map(c => c.count))
                return data.contactBreakdown.map(c => (
                  <div key={c.what} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{WHAT[c.what] ?? c.what}</span>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}><div style={{ width: `${(c.count / max) * 100}%`, height: '100%', background: GOLD, borderRadius: 4 }} /></div>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, textAlign: 'right' }}>{c.count}</span>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* Profiles */}
          <div style={{ ...card, marginBottom: 24, overflowX: 'auto' }}>
            <div style={h2}>MOST-VIEWED CREATIVES</div>
            <p style={hint}>&ldquo;Saw portfolio&rdquo; means the viewer scrolled to their work. &ldquo;Deepest photo&rdquo; is the furthest photo anyone opened.</p>
            {data.profiles.length === 0 ? <div style={hint}>No profile views yet.</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr><th style={th}>CREATIVE</th><th style={numTh}>VIEWS</th><th style={numTh}>VIEWERS</th><th style={numTh}>SAW PORTFOLIO</th><th style={numTh}>PHOTO OPENS</th><th style={numTh}>DEEPEST PHOTO</th><th style={numTh}>MESSAGE CLICKS</th><th style={numTh}>FOLLOWS</th></tr></thead>
                <tbody>{data.profiles.map(p => (
                  <tr key={p.id}>
                    <td style={td}>
                      <a href={`/account/directory/${p.id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none' }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', background: '#222', flexShrink: 0, display: 'inline-flex' }}>{p.avatar && <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
                        {p.name}
                      </a>
                    </td>
                    <td style={num}>{p.views}</td><td style={num}>{p.viewers}</td>
                    <td style={num}>{p.sawPortfolio} <span style={{ color: 'rgba(255,255,255,0.35)' }}>{pct(p.sawPortfolio, p.viewers)}</span></td>
                    <td style={num}>{p.photoOpens}</td><td style={num}>{p.deepestPhoto || '—'}</td><td style={num}>{p.messages}</td><td style={num}>{p.follows}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          {/* Castings */}
          <div style={{ ...card, overflowX: 'auto' }}>
            <div style={h2}>CASTINGS</div>
            <p style={hint}>Lots of viewers but few applications usually means unclear details or pay.</p>
            {data.castings.length === 0 ? <div style={hint}>No casting activity in this period.</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr><th style={th}>CASTING</th><th style={th}>POSTED BY</th><th style={th}>PAY</th><th style={th}>STATUS</th><th style={numTh}>VIEWERS</th><th style={numTh}>APPLY CLICKS</th><th style={numTh}>INTERESTED</th><th style={numTh}>CONFIRMED</th></tr></thead>
                <tbody>{data.castings.map(c => (
                  <tr key={c.id}>
                    <td style={td}><a href={`/account/castings/${c.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#fff' }}>{c.title}</a></td>
                    <td style={{ ...td, color: 'rgba(255,255,255,0.6)' }}>{c.author}</td>
                    <td style={{ ...td, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontSize: 11 }}>{c.comp}</td>
                    <td style={{ ...td, color: c.status === 'open' ? '#7be3a4' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>{c.status}</td>
                    <td style={num}>{c.viewers}</td><td style={num}>{c.applyClicks}</td><td style={num}>{c.interested}</td><td style={num}>{c.confirmed}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
