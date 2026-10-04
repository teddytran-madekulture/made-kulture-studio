'use client'
// Shown on members-only pages (directory, castings) to someone who turned the
// directory toggle ON but whose profile is still hidden for being incomplete.
// Since 2026-10-01 they get none of the community features until they're
// actually listed (lib/directory-access.ts), so this card IS the nudge: it
// names exactly what's missing and links straight to where to fix it.
// The blocker strings come from lib/directory-listing.ts profileBlockers().

const FIX: Record<string, { label: string; href: string }> = {
  'no name':         { label: 'Add your name',                                   href: '/account/profile' },
  'no role':         { label: 'Pick at least one role',                          href: '/account/profile' },
  'no bio':          { label: 'Write a short bio',                               href: '/account/profile' },
  'vendor agreement': { label: 'Sign the Vendor Agreement (Settings → Service listings)', href: '/account/profile?s=listings' },
  'nothing to show': { label: 'Add a portfolio photo, a link, or your Instagram', href: '/account/profile?s=portfolio' },
}

export default function FinishProfileCard({ blockers, what }: { blockers: string[]; what: string }) {
  const items = blockers.map(b => FIX[b] ?? { label: b, href: '/account/profile' })
  const first = items[0]?.href ?? '/account/profile'
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-gold-rgb), 0.3)', borderRadius: 8, padding: '28px 24px', maxWidth: 520 }}>
      <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600, color: 'var(--t-gold)', marginBottom: 8 }}>Almost there — finish your profile</div>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', lineHeight: 1.6, margin: '0 0 14px' }}>
        You&apos;ve joined the directory, but your profile isn&apos;t showing yet. {what} opens up as soon as other members can see you too.
        Finishing it also claims a First 100 spot while they last.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
        {items.map(i => (
          <li key={i.label} style={{ fontFamily: 'Inter', fontSize: 14, margin: '0 0 8px' }}>
            <a href={i.href} style={{ color: 'var(--t-fg)', textDecoration: 'underline' }}>{i.label}</a>
          </li>
        ))}
      </ul>
      <a href={first} style={{ display: 'inline-block', background: 'var(--t-fg)', color: 'var(--t-on-fg)', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textDecoration: 'none', padding: '11px 20px', borderRadius: 4 }}>
        FINISH MY PROFILE →
      </a>
    </div>
  )
}
