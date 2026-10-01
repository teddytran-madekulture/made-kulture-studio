// ONE place that records an arrival and decides whether the owner hears about it.
//
// Teddy, 2026-10-01: one push per booking, not one per signal. Five sessions at
// 2 PM = five pushes. So:
//   • phone  — the guest tapped CHECK IN on /checkin/<token> (reveals the code).
//              Counts as a check-in (people slip in behind each other, and the
//              tap is the trace of that), but NEVER pushes.
//   • door   — the booking's code opened a lock (igloohome webhook). Pushes.
//   • kiosk  — a set tablet / the shared check-in tablet. Pushes ONLY if the
//              door hasn't already — i.e. they didn't key their code in.
//   • desk   — staff checked them in. Same rule as kiosk.
// "Pushes" means: CLAIM bookings.arrival_alerted_at (null → now, .select()) and
// send only if the claim won. Door and kiosk racing can't double up, and a
// redelivered webhook can't either. Every signal is written to its own column
// so ATLAS can show PHONE / DOOR / KIOSK side by side (migration 130).
import { sendOwnerPush } from '@/lib/push'

export type ArrivalVia = 'phone' | 'door' | 'kiosk' | 'desk'

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })

export async function recordArrival(db: any, b: {
  id: string; start_time: string; end_time: string; checked_in_at?: string | null
  sets?: any; customers?: any
}, via: ArrivalVia, opts: { at?: string; detail?: string } = {}): Promise<{ pushed: boolean }> {
  const at = opts.at ?? new Date().toISOString()

  // First check-in wins: never move an arrival time already recorded.
  if (!b.checked_in_at) {
    await db.from('bookings').update({ checked_in_at: at, checked_in_via: via })
      .eq('id', b.id).is('checked_in_at', null)
  }
  if (via === 'door') {
    await db.from('bookings').update({ door_entered_at: at }).eq('id', b.id).is('door_entered_at', null)
  }
  if (via === 'phone') return { pushed: false }

  const { data: claimed } = await db.from('bookings')
    .update({ arrival_alerted_at: new Date().toISOString() })
    .eq('id', b.id).is('arrival_alerted_at', null).select('id')
  if (!claimed?.length) return { pushed: false }

  const one = (v: any) => (Array.isArray(v) ? v[0] : v)
  const who = one(b.customers)?.name ?? 'Guest'
  const where = one(b.sets)?.name ?? 'Full Studio Takeover'
  const how = via === 'door' ? (opts.detail ?? 'door') : via === 'kiosk' ? 'kiosk' : `desk${opts.detail ? ` · ${opts.detail}` : ''}`
  await sendOwnerPush({
    title: `${who} · ${where}`,
    body: `Checked in at the ${how} · ${fmtTime(b.start_time)}–${fmtTime(b.end_time)}`,
    url: '/admin/dashboard', tag: `checkin-${b.id}`,
  }).catch(() => {})
  return { pushed: true }
}
