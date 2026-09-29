// Founding Creatives badge (migration 120). Gold, theme-aware (light/dark).
//   size="sm" → "★ FOUNDING"                on directory cards
//   size="lg" → "★ FOUNDING CREATIVE #27"   on profile pages
export default function FoundingBadge({ number, size = 'sm', brand = false }: { number: number; size?: 'sm' | 'lg'; brand?: boolean }) {
  const lg = size === 'lg'
  return (
    <span title={`Founding ${brand ? 'Member' : 'Creative'} #${number}: one of the first 100 in the Made Kulture directory`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        fontFamily: 'Inter', fontSize: lg ? 11 : 9, fontWeight: 700, letterSpacing: '0.1em',
        color: 'var(--t-gold)', background: 'rgba(var(--t-gold-rgb), 0.12)',
        border: '1px solid rgba(var(--t-gold-rgb), 0.5)', borderRadius: 4,
        padding: lg ? '4px 9px' : '2px 6px', lineHeight: 1.3,
      }}>
      <span aria-hidden style={{ fontSize: lg ? 11 : 9 }}>★</span>
      {lg ? `FOUNDING ${brand ? 'MEMBER' : 'CREATIVE'} #${number}` : 'FOUNDING'}
    </span>
  )
}
