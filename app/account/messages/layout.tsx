'use client'
// Messages frame (2026-10-05). Desktop: two panes, Instagram-DM style — the
// inbox list on the left (stays mounted while you switch threads) and the open
// conversation on the right, filling the window with no page scroll.
// Phones: just the page — the list at /account/messages, a full chat screen at
// /account/messages/<id>.
import { usePathname } from 'next/navigation'
import ConversationList from '@/components/messages/ConversationList'
import { useIsMobile } from '@/lib/use-is-mobile'

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()
  const pathname = usePathname() ?? ''
  const selectedId = pathname.startsWith('/account/messages/') ? pathname.split('/')[3] : null

  if (isMobile) return <>{children}</>

  const hair = '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr',
      // .acct-content pads 36px top + 60px bottom (minus the -12px pull-up). --vh-full
      // corrects for the desktop body zoom (app/globals.css).
      height: 'calc(var(--vh-full) - 90px)', minHeight: 480, maxWidth: 1400,
      border: hair, borderRadius: 12, overflow: 'hidden', background: 'var(--t-bg)', margin: '-12px 0 0',
    }}>
      <aside style={{ borderRight: hair, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '18px 16px 14px', borderBottom: hair, flexShrink: 0 }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, lineHeight: 1 }}>MESSAGES</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <ConversationList selectedId={selectedId} pane />
        </div>
      </aside>
      <section style={{ minWidth: 0, minHeight: 0 }}>{children}</section>
    </div>
  )
}
