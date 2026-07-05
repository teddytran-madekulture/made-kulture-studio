import React from 'react'

// Render CMS text for display: \n becomes <br/>, **text** becomes <strong>.
// Client-safe (no supabase import). Used by the public pages for editable copy.
export function fmt(s: string | undefined | null): React.ReactNode {
  const text = s ?? ''
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  lines.forEach((line, li) => {
    if (li > 0) out.push(<br key={`br${li}`} />)
    const parts = line.split(/\*\*(.+?)\*\*/g)
    parts.forEach((part, pi) => {
      if (pi % 2 === 1) out.push(<strong key={`b${li}-${pi}`} style={{ fontWeight: 600, color: 'inherit' }}>{part}</strong>)
      else if (part) out.push(part)
    })
  })
  return out
}
