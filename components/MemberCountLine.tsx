'use client'
// "33 MEMBERS AND GROWING · +6 THIS MONTH" — the directory's headline count on
// the home teaser and the /directory landing page. Counts only (see
// app/api/directory/stats). Renders nothing until the count is worth showing.
import { useDirectoryStats, memberCountLine } from '@/lib/use-directory-stats'

const mono = '"JetBrains Mono", ui-monospace, monospace'

export default function MemberCountLine() {
  const l = memberCountLine(useDirectoryStats())
  if (!l) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 16px', fontFamily: mono, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
      <span><span style={{ color: '#c9b27e', fontSize: 15, fontWeight: 500 }}>{l.count}</span> {l.rest}</span>
      {l.recent > 0 && <span style={{ color: 'rgba(255,255,255,0.5)' }}>+{l.recent} this month</span>}
    </div>
  )
}
