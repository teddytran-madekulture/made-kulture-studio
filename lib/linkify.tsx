import React from 'react'

const URL_RE = /(https?:\/\/[^\s]+)/g

// Turn plain-text URLs in a message body into clickable links, leaving the rest
// as text. Used in DM threads and the casting team channel.
export function linkify(text: string, linkColor = '#8ab4f8'): React.ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part)
      ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          style={{ color: linkColor, textDecoration: 'underline', wordBreak: 'break-all' }}
          onClick={e => e.stopPropagation()}>{part}</a>
      )
      : <React.Fragment key={i}>{part}</React.Fragment>
  )
}
