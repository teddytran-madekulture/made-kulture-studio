import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed, changeAdminPassword } from '@/lib/admin-auth'

// POST /api/admin/auth/change-password
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await req.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both current and new password are required.' }, { status: 400 })
  }

  const result = await changeAdminPassword(currentPassword, newPassword)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
