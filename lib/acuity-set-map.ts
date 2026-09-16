// The ONE Acuity appointment-type → Made Kulture set mapping.
//
// ⚠️ THIS FILE EXISTS BECAUSE THERE WERE TWO OF IT. The webhook (fires when a
// customer books) and /api/admin/sync-acuity (the manual backfill) each carried
// their own copy of the table plus their own copy of the resolver. When The Tank
// opened, only the sync route's copy learned about it — so on 2026-09-15 a real
// Tank booking came through the webhook, matched nothing, and was stored with
// `set_id` NULL. lib/extensions.ts reads a NULL set as a FULL-STUDIO BUYOUT, so
// every kiosk tablet in the building announced a buyout that did not exist,
// while the guest's own set tablet said nobody was booked. Nothing errored.
//
// ⇒ Adding a set is now ONE edit, here. Keep it that way: import from this
//   file, never paste the table into a route. Same reasoning as
//   lib/guest-rate.ts (four rate tables) and lib/booking-times.ts.
//
// ⚠️ The slug→calendar map in lib/acuity-sync.ts is a DIFFERENT table with a
// different job (which Acuity calendars to block). It is not a copy of this one
// and must not be merged into it — but a new set needs a line in both.

// Minimal structural type: all this needs is `.from()`. Deliberately not
// SupabaseClient, so a supabase-js generics change can't break this file.
type Db = { from: (table: string) => any }

/** Lowercased Acuity appointment-type name → `sets.name`. null = full buyout. */
export const ACUITY_TYPE_TO_SET: Record<string, string | null> = {
  'set a':             'Set A',
  'set b':             'Set B',
  'set c':             'Set C',
  'set d':             'Set D',
  'concrete':          'Concrete',
  'vintage':           'Vintage',
  'cottage':           'Cottage',
  'watering hole':     'The Watering Hole',
  'the watering hole': 'The Watering Hole',
  'the tank':          'The Tank',
  'tank':              'The Tank',
  'studio one':        'Studio One',
  // Full warehouse buyout aliases → no specific set.
  // ⚠️ null here is MEANINGFUL and is not the same as "no match": it means a
  // real buyout, which is exactly what a NULL set_id is supposed to represent.
  'full studio':          null,
  'full buyout':          null,
  'studio buyout':        null,
  'all warehouse access': null,
}

export type ResolvedSet = { setId: string | null; setName: string }

async function idForName(db: Db, name: string): Promise<string | null> {
  const { data } = await db.from('sets').select('id').eq('name', name).single()
  if (!data?.id) {
    // The map named a set the sets table does not have. Silent NULL here is how
    // a booking ends up looking like a buyout, so say so out loud.
    console.warn(`[acuity-set-map] mapped to "${name}" but no sets row matches — booking will have no set`)
    return null
  }
  return data.id
}

/**
 * Resolve an Acuity appointment-type name to a set.
 *
 * @param source label for log lines, e.g. 'Acuity webhook' — so an unmatched
 *        type is traceable to the path that saw it.
 */
export async function resolveAcuitySet(db: Db, appointmentType: string, source: string): Promise<ResolvedSet> {
  const key = (appointmentType ?? '').toLowerCase().trim()

  // 1. Exact map match.
  if (key in ACUITY_TYPE_TO_SET) {
    const name = ACUITY_TYPE_TO_SET[key]
    if (!name) return { setId: null, setName: 'Full Studio Buyout' }
    return { setId: await idForName(db, name), setName: name }
  }

  // 2. Partial match against map keys — handles combo types like
  //    "Studio One + PMI Smoke Ninja Pro..." → Studio One.
  // ⚠️ Insertion order decides ties, so the longer alias must come FIRST in the
  //    table above ('the watering hole' before 'watering hole').
  for (const [mapKey, mapName] of Object.entries(ACUITY_TYPE_TO_SET)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      if (!mapName) return { setId: null, setName: 'Full Studio Buyout' }
      return { setId: await idForName(db, mapName), setName: mapName }
    }
  }

  // 3. Fuzzy fallback — search the sets table by partial name, which resolves
  //    promo/seasonal sets that exist as rows but were never added above.
  const { data } = await db.from('sets').select('id, name').ilike('name', `%${(appointmentType ?? '').trim()}%`).limit(1).single()
  if (data) return { setId: data.id, setName: data.name }

  // 4. Unrecognized. Stored without a set, which downstream reads as a BUYOUT —
  //    so this warning is the only trace that a booking lost its room.
  console.warn(`[${source}] Unrecognized appointment type: "${appointmentType}" — stored with NO SET (reads as a full buyout)`)
  return { setId: null, setName: appointmentType }
}
