// GET  -> Sign in with Apple secret status (for the admin banner)
// POST -> "I renewed it": record today (Central) as the new generation date.
// See lib/apple-secret.ts. Added 2026-10-07.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { getAppleSecretStatus, markAppleSecretRenewed } from '@/lib/apple-secret'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await getAppleSecretStatus(db))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'lookup failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await markAppleSecretRenewed(db)
    return NextResponse.json(await getAppleSecretStatus(db))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'save failed' }, { status: 500 })
  }
}
