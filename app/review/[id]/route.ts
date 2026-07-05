import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } }
)

export const dynamic = 'force-dynamic'

// GET /review/[bookingId] — click-tracked redirect to the Google review page.
// Records review_clicked_at on the booking (so the follow-up email is skipped),
// then bounces to the configured review URL. Booking ids are unguessable UUIDs.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data } = await supabase.from('site_settings').select('key, value').in('key', ['review_url'])
  const reviewUrl = data?.find(r => r.key === 'review_url')?.value
  const fallback = 'https://www.google.com/maps/search/Made+Kulture+Houston'

  // Best-effort click stamp; never block the redirect on it.
  if (params.id && /^[0-9a-f-]{36}$/i.test(params.id)) {
    await supabase.from('bookings')
      .update({ review_clicked_at: new Date().toISOString() })
      .eq('id', params.id)
      .is('review_clicked_at', null)
  }

  return NextResponse.redirect(reviewUrl || fallback, { status: 302 })
}
