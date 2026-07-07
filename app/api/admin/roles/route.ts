import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { CREATIVE_ROLES } from '@/lib/roles'

export const dynamic = 'force-dynamic'

// GET /api/admin/roles — every role with its source (builtin/custom) + hidden flag,
// so the owner can add new roles or hide/remove any of them.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const [ex, hi] = await Promise.all([
    db.from('directory_roles').select('role').order('role'),
    db.from('hidden_roles').select('role'),
  ])
  const custom = (ex.data ?? []).map((r: any) => r.role).filter(Boolean)
  const hidden = new Set((hi.data ?? []).map((r: any) => (r.role || '').toLowerCase()))
  const builtinSet = new Set(CREATIVE_ROLES.map(r => r.toLowerCase()))
  const merged = [...CREATIVE_ROLES, ...custom.filter((r: string) => !builtinSet.has(r.toLowerCase()))]
  const roles = merged.map(name => ({
    name,
    source: builtinSet.has(name.toLowerCase()) ? 'builtin' : 'custom',
    hidden: hidden.has(name.toLowerCase()),
  }))
  return NextResponse.json({ roles })
}

// POST /api/admin/roles  { action: 'add' | 'remove' | 'restore', role }
//  add     → new custom role (un-hides it first if it was hidden)
//  remove  → hide a built-in, or delete a custom
//  restore → un-hide (bring a hidden role back)
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const role = (b.role || '').trim()
  const action = b.action
  if (!role) return NextResponse.json({ error: 'Enter a role.' }, { status: 400 })

  const db = supabaseAdmin()
  const isBuiltin = CREATIVE_ROLES.some(r => r.toLowerCase() === role.toLowerCase())

  if (action === 'add') {
    if (isBuiltin) {
      // Re-adding a built-in just means un-hiding it.
      await db.from('hidden_roles').delete().ilike('role', role)
      return NextResponse.json({ success: true })
    }
    await db.from('hidden_roles').delete().ilike('role', role)
    const { error } = await db.from('directory_roles').upsert({ role }, { onConflict: 'role' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'remove') {
    if (isBuiltin) {
      const { error } = await db.from('hidden_roles').upsert({ role }, { onConflict: 'role' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      await db.from('directory_roles').delete().ilike('role', role)
      await db.from('hidden_roles').delete().ilike('role', role)
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'restore') {
    await db.from('hidden_roles').delete().ilike('role', role)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
