// Link previews for a photographer's sign-up page: when the link is texted or
// posted, it unfurls with their cover photo, title and date (opengraph-image.tsx).
import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { flyerInfoFor } from '@/lib/mini-sessions-server'
import type { MiniSession } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const base: Metadata = { robots: { index: false, follow: false } }
  if (!/^[0-9a-f]{32}$/i.test(params.token)) return { ...base, title: 'Mini Sessions' }
  try {
    const db = supabaseAdmin()
    const { data: m } = await db.from('mini_sessions').select('*').eq('share_token', params.token).maybeSingle()
    if (!m) return { ...base, title: 'Mini Sessions' }
    const info = await flyerInfoFor(db, m as MiniSession)
    if (!info) return { ...base, title: 'Mini Sessions' }
    const description = [`with ${info.photographer}`, info.day, info.priceText, 'Pick your time at Made Kulture, Houston.'].filter(Boolean).join(' · ')
    return {
      ...base,
      title: { absolute: `${info.title} — Mini Sessions` },
      description,
      openGraph: { title: info.title, description, type: 'website', siteName: 'Made Kulture' },
      twitter: { card: 'summary_large_image', title: info.title, description },
    }
  } catch {
    return { ...base, title: 'Mini Sessions' }
  }
}

export default function MiniLayout({ children }: { children: React.ReactNode }) {
  return children
}
