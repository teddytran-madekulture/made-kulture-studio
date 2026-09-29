// "First 100" badge (migration 120 — stored as founding_number). The Hex Crest
// emblem: gold hexagon, star over "100". Theme-aware via --t-gold / --t-bg.
//   <HexCrest size={16} />                       bare emblem (cards, Explore tiles)
//   <FoundingBadge number={27} />                emblem only, small
//   <FoundingBadge number={27} size="lg" />      emblem + "FIRST 100 · No. 27"

export function HexCrest({ size = 18, title }: { size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title ?? 'First 100'} style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}>
      {title && <title>{title}</title>}
      <path d="M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z" fill="var(--t-gold, #e6c07a)" />
      <path d="M50 13 L82 31.5 L82 68.5 L50 87 L18 68.5 L18 31.5 Z" fill="none" stroke="var(--t-on-gold, #080808)" strokeWidth="2" />
      <path d="M50 22 l3.2 6.6 7.2 .9 -5.3 5 1.4 7.1 -6.5-3.5 -6.5 3.5 1.4-7.1 -5.3-5 7.2-.9z" fill="var(--t-on-gold, #080808)" />
      <text x="50" y="74" textAnchor="middle" fontFamily="Anton, 'Bebas Neue', sans-serif" fontSize="27" fill="var(--t-on-gold, #080808)">100</text>
    </svg>
  )
}

export default function FoundingBadge({ number, size = 'sm' }: { number: number; size?: 'sm' | 'lg'; brand?: boolean }) {
  const label = `First 100 · No. ${String(number).padStart(2, '0')}: one of the first 100 in the Made Kulture directory`
  if (size === 'sm') return <HexCrest size={20} title={label} />
  return (
    <span title={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <HexCrest size={30} />
      <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-gold)' }}>
        FIRST 100 · NO. {String(number).padStart(2, '0')}
      </span>
    </span>
  )
}
