import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/customers/duplicates
// Returns groups of customers that share the same normalized name or phone number
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all customers with booking counts
  const { data: customers, error } = await supabase
    .from('customers')
    .select(`
      id, name, email, phone, status, banned, created_at,
      bookings ( id )
    `)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')

  // Group by normalized name
  const nameGroups: Record<string, any[]> = {}
  for (const c of customers ?? []) {
    if (!c.name) continue
    const key = normalize(c.name)
    if (!nameGroups[key]) nameGroups[key] = []
    nameGroups[key].push(c)
  }

  // Also group by phone (non-empty)
  const phoneGroups: Record<string, any[]> = {}
  for (const c of customers ?? []) {
    if (!c.phone) continue
    const key = c.phone.replace(/\D/g, '')
    if (key.length < 7) continue
    if (!phoneGroups[key]) phoneGroups[key] = []
    phoneGroups[key].push(c)
  }

  // Collect all duplicate groups (deduplicate across name + phone groupings)
  const seenGroups = new Set<string>()
  const groups: any[] = []

  const addGroup = (members: any[], reason: string) => {
    const key = members.map(m => m.id).sort().join(',')
    if (seenGroups.has(key)) return
    seenGroups.add(key)
    groups.push({
      reason,
      members: members.map(m => ({
        id:           m.id,
        name:         m.name,
        email:        m.email,
        phone:        m.phone,
        status:       m.status ?? 'regular',
        banned:       m.banned ?? false,
        createdAt:    m.created_at,
        bookingCount: (m.bookings as any[]).length,
      })),
    })
  }

  for (const [, members] of Object.entries(nameGroups)) {
    if (members.length > 1) addGroup(members, 'name')
  }
  for (const [, members] of Object.entries(phoneGroups)) {
    if (members.length > 1) addGroup(members, 'phone')
  }

  // Sort: groups with more members first
  groups.sort((a, b) => b.members.length - a.members.length)

  return NextResponse.json({ groups, total: groups.length })
}
