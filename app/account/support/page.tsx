// /account/support — Help & Support inside the account area (2026-10-07).
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import SupportCenter from '@/components/SupportCenter'

export const metadata = { title: 'Help & Support' }

export default async function AccountSupportPage() {
  const { data: { user } } = await createClient().auth.getUser()
  return (
    <Suspense fallback={null}>
      <SupportCenter signedIn={!!user} email={user?.email ?? null} />
    </Suspense>
  )
}
