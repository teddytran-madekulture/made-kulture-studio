// REAL LOGOUT (migration 190, 2026-11-23) — server-side cancelling of admin and
// staff sessions. The CHECK happens in middleware.ts (it strips a cancelled
// cookie before any route sees it, so the hundreds of sync isAdminAuthed /
// requireStaff callers needed no change). This file only WRITES cancellations.
//
// ⚠️ A session with no row is VALID. Login never touches this table, so a
// problem here can never lock anyone out — the worst case is that a logout
// does not cancel server-side, which every function below reports (never
// swallows) so the caller can say so.
import { supabaseAdmin } from '@/lib/supabase'

export const ALL_SESSIONS = '__all__'
const KEEP_MS = 8 * 24 * 60 * 60 * 1000   // admin tokens die at 7 days anyway

/** Cancel one admin session id, or ALL_SESSIONS. Returns an error message or null. */
export async function revokeAdminSession(id: string): Promise<string | null> {
  const db = supabaseAdmin()
  const { data, error } = await db.from('admin_session_revocations')
    .upsert({ id, revoked_at: new Date().toISOString() }, { onConflict: 'id' }).select('id')
  if (error) return error.message
  if (!data?.length) return 'The session list did not accept the change.'
  // Tidy up rows for tokens that have expired on their own. Non-fatal.
  const { error: dErr } = await db.from('admin_session_revocations').delete()
    .neq('id', ALL_SESSIONS).lt('revoked_at', new Date(Date.now() - KEEP_MS).toISOString())
  if (dErr) console.error('[admin-sessions] cleanup failed (non-fatal):', dErr.message)
  return null
}

/** Refuse every session this staff member holds that was issued before now. */
export async function revokeStaffSessions(staffId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from('staff_users')
    .update({ sessions_valid_after: new Date().toISOString() }).eq('id', staffId).select('id')
  if (error) return error.message
  return data?.length ? null : 'Staff account not found.'
}
