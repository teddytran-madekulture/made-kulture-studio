// /directory — the public front door to the members-only directory
// (2026-10-02, Directory Plan phase 1). Signed-in members go straight to
// /account/directory, which already handles "listing off" and "finish your
// profile". Everyone else gets the sign-up landing page: counts only, no names.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DirectoryLanding from './DirectoryLanding'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'The Directory',
  description: 'A members-only network of Houston photographers, models, stylists and makeup artists, built into the Made Kulture studio. Free with your account.',
}

export default async function DirectoryPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/account/directory')
  return <DirectoryLanding />
}
