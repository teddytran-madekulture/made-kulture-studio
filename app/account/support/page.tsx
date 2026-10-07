// /account/support — Help & Support inside the account area (2026-10-07).
import { createClient } from '@/lib/supabase/server'
import SupportCenter from '@/components/SupportCenter'

export const metadata = { title: 'Help & Support' }

export default async function AccountSupportPage() {
  const { data: { user } } = await createClient().auth.getUser()
  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, letterSpacing: '0.02em', margin: '0 0 8px' }}>HELP &amp; SUPPORT</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))', margin: '0 0 24px' }}>Search for an answer, or send us a request.</p>
      <SupportCenter signedIn={!!user} email={user?.email ?? null} />
    </div>
  )
}
