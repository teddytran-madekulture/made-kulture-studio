// ── Two-way Acuity sync (outbound) ─────────────────────────────────────────────
// When a booking is made on THIS site, we block the matching time on the relevant
// Acuity calendar(s) so the legacy Acuity site can't double-book it. Transition-only.

// Set slug → Acuity calendar ID (verified from the Acuity account, June 2026)
const SLUG_TO_CALENDAR: Record<string, number> = {
  'set-a':         3776075,
  'set-b':         7680299,
  'set-c':         7680308,
  'set-d':         7680310,
  'concrete':      6489354,
  'vintage':       6489337,
  'cottage':       6489364,
  'watering-hole': 6489285,
  'the-tank':      12477279,
  'studio-one':    7825818,
}
const WAREHOUSE_CALENDAR = 7680511 // ALL WAREHOUSE ACCESS
const ALL_SET_CALENDARS = Object.values(SLUG_TO_CALENDAR)

function acuityAuth(): string | null {
  const userId = process.env.ACUITY_USER_ID
  const apiKey = process.env.ACUITY_API_KEY
  if (!userId || !apiKey) return null
  return 'Basic ' + Buffer.from(`${userId}:${apiKey}`).toString('base64')
}

/**
 * Which Acuity calendars should be blocked for this booking.
 * - A single set booking blocks that set's calendar + the warehouse calendar
 *   (so a full-buyout can't be booked over it).
 * - A full studio buyout blocks every set calendar + the warehouse calendar.
 */
function targetCalendars(type: string, setSlug: string | null): number[] {
  if (type === 'studio') return [...ALL_SET_CALENDARS, WAREHOUSE_CALENDAR]
  const cal = setSlug ? SLUG_TO_CALENDAR[setSlug] : undefined
  if (!cal) return []
  return [cal, WAREHOUSE_CALENDAR]
}

/**
 * Create Acuity blocks for a website booking. Best-effort: returns the IDs of
 * blocks that were created so they can be removed later. Never throws.
 */
export async function createAcuityBlocks(opts: {
  type: string
  setSlug: string | null
  startISO: string
  endISO: string
  customerName?: string
  setName?: string
}): Promise<number[]> {
  const auth = acuityAuth()
  if (!auth) { console.warn('[acuity-sync] missing credentials; skipping block creation'); return [] }

  const calendars = targetCalendars(opts.type, opts.setSlug)
  if (!calendars.length) {
    console.warn('[acuity-sync] no calendar mapping for', opts.type, opts.setSlug)
    return []
  }

  const notes = `Made Kulture website booking — ${opts.setName ?? (opts.type === 'studio' ? 'Full Studio' : 'Set')}${opts.customerName ? ` (${opts.customerName})` : ''}`
  const ids: number[] = []

  await Promise.all(calendars.map(async calendarID => {
    try {
      const res = await fetch('https://acuityscheduling.com/api/v1/blocks', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: opts.startISO, end: opts.endISO, calendarID, notes }),
      })
      if (!res.ok) {
        console.error(`[acuity-sync] block create failed (cal ${calendarID}): ${res.status} ${await res.text()}`)
        return
      }
      const block = await res.json()
      if (block?.id) ids.push(block.id)
    } catch (err) {
      console.error(`[acuity-sync] block create error (cal ${calendarID}):`, err)
    }
  }))

  return ids
}

/** Remove Acuity blocks (on website-booking cancellation). Best-effort. */
export async function deleteAcuityBlocks(blockIds: number[]): Promise<void> {
  const auth = acuityAuth()
  if (!auth || !blockIds?.length) return
  await Promise.all(blockIds.map(async id => {
    try {
      const res = await fetch(`https://acuityscheduling.com/api/v1/blocks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      })
      if (!res.ok) console.error(`[acuity-sync] block delete failed (${id}): ${res.status}`)
    } catch (err) {
      console.error(`[acuity-sync] block delete error (${id}):`, err)
    }
  }))
}
