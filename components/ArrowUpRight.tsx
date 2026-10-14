// The line arrow used across the site (home CTAs, set cards). Use this instead
// of typing the ↗ character: iOS renders that character as a blue EMOJI tile,
// which is what made buttons look broken on phones and in the app.
// Sized in em so it follows the label it sits in; colour is currentColor.
import type { CSSProperties } from 'react'

export default function ArrowUpRight({ size = '1.3em', strokeWidth = 1.5, style }: {
  size?: number | string
  strokeWidth?: number
  style?: CSSProperties
}) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: '-0.28em', flexShrink: 0, ...style }}>
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  )
}
