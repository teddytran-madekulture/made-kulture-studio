// The ONE safety net behind "the door code lives on the check-in page"
// (2026-10-01, lib/igloohome.ts doorCodeLinkLine): a guest replies CODE to a
// text and the code is texted back, if their session is live or starts within
// CODE_REVEAL_MINUTES. Deliberately NOT: a start-time auto-text (people run
// late; texting the code at start time would hand it to everyone who hasn't
// shown up yet) or a "revealed but not through the door" alert (Teddy: one
// push per arrival, from the door — see lib/arrival.ts).
//
// Texting the code is not an arrival: checked_in_at stays untouched (a no-show
// must not look checked in). The owner gets one push because a guest who
// needed this is probably standing at the door right now.
// ⚠️ SMS bodies here are GSM-7 only: no emoji, no typographic dashes.
import { CODE_REVEAL_MINUTES, DOOR_CODE_HOWTO } from '@/lib/igloohome'
import { sendOwnerPush } from '@/lib/push'

const spaced = (c: string) => c.replace(/(\d{3})(?=\d)/g, '$1 ')
const LIVE = ['confirmed', 'completed']

function codeBody(b: any, setName: string): string | null {
  if (!b.door_code && !b.door_code_back) return null
  return [
    `Made Kulture door code for ${setName}:`,
    b.door_code ? `Front door: ${spaced(b.door_code)}` : null,
    b.door_code_back ? `Back door: ${spaced(b.door_code_back)}` : null,
    DOOR_CODE_HOWTO,
    'Works during your booked time only.',
  ].filter(Boolean).join('\n')
}

async function notifyOwner(b: any, how: string) {
  await sendOwnerPush({
    title: `Door code texted: ${b.customers?.name ?? 'Guest'}`,
    body: `${b.sets?.name ?? 'Full Studio Takeover'} · they replied CODE · the door will confirm arrival`,
    url: '/admin/dashboard', tag: `code-fallback-${b.id}`,
  }).catch(() => {})
}

/** The reply to a CODE text from these customers' phone, or null if no session
 *  is live or starting within CODE_REVEAL_MINUTES. */
export async function codeTextFor(db: any, customerIds: string[], how: 'sms-code-reply'): Promise<string | null> {
  if (!customerIds.length) return null
  const now = Date.now()
  const { data: bks, error } = await db.from('bookings')
    .select('id, start_time, end_time, status, door_code, door_code_back, checked_in_at, sets ( name ), customers ( name )')
    .in('customer_id', customerIds).in('status', LIVE)
    .lte('start_time', new Date(now + CODE_REVEAL_MINUTES * 60 * 1000).toISOString())
    .gte('end_time', new Date(now - 60 * 60 * 1000).toISOString())
    .order('start_time').limit(5)
  if (error) throw new Error(error.message)
  const b = (bks ?? []).find((x: any) => x.door_code || x.door_code_back)
  if (!b) return null
  const body = codeBody(b, b.sets?.name ?? 'your session')
  if (!body) return null
  await notifyOwner(b, how)
  return body
}
