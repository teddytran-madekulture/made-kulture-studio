// GET /api/jukebox/zones — public list of jukebox zones (for the zone picker
// when /jukebox is opened without a ?zone=, and for the admin console tabs).

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const { data } = await supabaseAdmin()
    .from('jukebox_zones')
    .select('id, slug, name, is_open, source')
    .order('sort', { ascending: true })
  return NextResponse.json({ zones: data ?? [] })
}
