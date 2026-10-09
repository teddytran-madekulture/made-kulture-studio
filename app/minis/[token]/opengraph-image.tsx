// The unfurl image for a photographer's sign-up link (1200×630).
import { supabaseAdmin } from '@/lib/supabase'
import { flyerInfoFor } from '@/lib/mini-sessions-server'
import { ogImage } from '@/lib/mini-flyer'
import type { MiniSession } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'
export const alt = 'Mini Sessions at Made Kulture'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export default async function Image({ params }: { params: { token: string } }) {
  let info = null
  if (/^[0-9a-f]{32}$/i.test(params.token)) {
    try {
      const db = supabaseAdmin()
      const { data: m } = await db.from('mini_sessions').select('*').eq('share_token', params.token).maybeSingle()
      if (m) info = await flyerInfoFor(db, m as MiniSession)
    } catch { info = null }
  }
  return ogImage(info && !info.cancelled ? info : null, APP_URL)
}
