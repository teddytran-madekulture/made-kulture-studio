import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// The rail's Profile button: members listed in the directory land on their
// public profile (what everyone else sees, with Edit profile on it). Anyone
// not listed yet goes to Edit profile, which shows the join checklist.
export const dynamic = 'force-dynamic'

export default async function MePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account/me')
  const { data: p } = await supabase
    .from('customer_profiles').select('directory_opt_in, account_type').eq('id', user.id).maybeSingle()
  if (p?.directory_opt_in && p.account_type !== 'customer') redirect(`/account/directory/${user.id}`)
  redirect('/account/profile')
}
