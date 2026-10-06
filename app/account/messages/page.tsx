'use client'
// /account/messages — phones: the inbox list. Desktop: the list lives in the
// left pane (layout.tsx), so this fills the right pane with a prompt.
import ConversationList from '@/components/messages/ConversationList'
import { useIsMobile } from '@/lib/use-is-mobile'

export default function MessagesPage() {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <div>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, margin: '0 0 20px' }}>MESSAGES</h1>
        <ConversationList />
      </div>
    )
  }
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'Inter', textAlign: 'center', padding: 24 }}>
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
      <div style={{ fontSize: 17, fontWeight: 600 }}>Your messages</div>
      <div style={{ fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))' }}>Pick a conversation on the left.</div>
    </div>
  )
}
