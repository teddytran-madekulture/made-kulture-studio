'use client'
import React from 'react'

// Minimal Markdown renderer for the rental agreements. Supports: # h1, ## h2,
// - bullet lists, blank-line paragraphs, and **bold** inline. That's all the
// agreement text uses — no external dependency needed.

function inline(text: string, keyBase: string): React.ReactNode[] {
  return text.split('**').map((part, i) =>
    i % 2 === 1
      ? <strong key={`${keyBase}-b${i}`} style={{ color: '#fff', fontWeight: 600 }}>{part}</strong>
      : <React.Fragment key={`${keyBase}-t${i}`}>{part}</React.Fragment>
  )
}

export default function AgreementMarkdown({ markdown, isMobile }: { markdown: string; isMobile?: boolean }) {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n')
  const out: React.ReactNode[] = []
  let bullets: string[] = []
  let key = 0

  const flushBullets = () => {
    if (bullets.length === 0) return
    const items = bullets
    bullets = []
    out.push(
      <ul key={`ul${key++}`} style={{ margin: '0 0 12px', paddingLeft: 20 }}>
        {items.map((li, i) => (
          <li key={i} style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 8 }}>{inline(li, `li${key}-${i}`)}</li>
        ))}
      </ul>
    )
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim() === '') { flushBullets(); continue }
    if (line.startsWith('## ')) {
      flushBullets()
      out.push(<h2 key={`h2${key++}`} style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.02em', margin: '32px 0 12px' }}>{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      flushBullets()
      out.push(<h1 key={`h1${key++}`} style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 34 : 48, letterSpacing: '0.02em', lineHeight: 1.04, margin: '0 0 8px' }}>{line.slice(2)}</h1>)
    } else if (line.startsWith('- ')) {
      bullets.push(line.slice(2))
    } else {
      flushBullets()
      out.push(<p key={`p${key++}`} style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: '0 0 12px' }}>{inline(line, `p${key}`)}</p>)
    }
  }
  flushBullets()

  return <>{out}</>
}
