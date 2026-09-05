// POST /api/webhooks/igloohome — the door tells us who walked in.
//
// Every booking already mints an hourly algoPIN per lock (lib/igloohome.ts) and
// stores it on the booking (bookings.door_code / door_code_back). With a Bridge
// on each door, the lock's activity log reaches us as a webhook, and the log
// entry for a PIN unlock carries THE PIN ITSELF. So arrival becomes a lookup:
// match the pin to the booking that owns it, stamp checked_in_at.
//
// Why this matters beyond convenience: app/admin/dashboard/page.tsx:410 is
//   if (!b.checked_in_at) return 0
// so a guest who let themselves in with the door code and never tapped a tablet
// accrued ZERO overtime. Check-in has been optional since the set tablets
// dropped it (0df7d73). This closes that silently.
//
// -- Payload shape (igloohome "Bridge Automated Events", verified 2026-09-03) --
//   payload.event.type = 5  -> Activity Log Received
//   payload.event.data.activityLogs[] = [{ logType, entryDate, pin?, ... }]
//   payload.product.id      -> the lock device id
//
//   logType 22 = duration PIN used for the FIRST time   -> pin present
//   logType 19 = duration PIN used, previously used     -> pin present
//   Our algoPINs are duration PINs, so a guest's first entry is 22 and every
//   re-entry that session is 19. Both must be handled: a guest who steps out to
//   their car and back produces 22 then 19, and a webhook we drop or that
//   arrives out of order must still be able to check them in off the 19.
//
//   Also logged, not acted on: 16 wrong PIN, 53 attempted break-in,
//   43 key card, 51/52 key/thumbturn, 18 master PIN.
//
// WARNING: the event does NOT carry accessName or pinId. We send accessName when
// minting (MK <customer> <date>) and the igloohome APP renders it, but it never
// comes back over the wire. Matching is on the PIN digits. Do not go looking for
// a name field here.

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, createPublicKey, verify as cryptoVerify } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Service role: this writes bookings and door_events, and door_events has RLS
// on with no policies by design. See user-scoped-write-sweep for why a
// cookie-scoped client here would no-op silently as anon.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// Log types that mean "someone opened the door with a generated PIN".
const LOG_PIN_FIRST_USE = 22
const LOG_PIN_REUSE     = 19
const PIN_UNLOCK_TYPES  = new Set([LOG_PIN_FIRST_USE, LOG_PIN_REUSE])

// WARNING: an hourly algoPIN's window is FLOORED to the top of the start hour
// and CEILED to the top of the hour after the end (mintHourlyPin). A 12:30
// booking's code is live at 12:00. So the booking whose window "contains" an
// entry has to be matched with an hour of slack on each side, or a guest
// arriving at 12:50 for a 1:00 session matches nothing and is never checked in.
const PIN_WINDOW_SLACK_MS = 60 * 60 * 1000

// -- Signature verification --------------------------------------------------
//
// igloohome signs each delivery with header x-igloocompany-sha256 (base64).
// Signed data is METHOD|Host|Path|Content-Type|Date|Body joined with "|", run
// through HMAC-SHA256 *keyed with the public key*, and the digest RSA-verified.
// That construction is unusual — an HMAC keyed by a public value adds no
// secrecy — but it is exactly what igloohome documents, so it is what we
// implement. The security here rests on the RSA signature, not the HMAC.
//
// WARNING: IGLOOHOME_WEBHOOK_PUBLIC_KEY is not set yet — requested from
// dev+support@igloocompany.co on 2026-09-03; it is not downloadable from the
// portal. Until it lands this route ACKNOWLEDGES deliveries and CHANGES
// NOTHING: no check-in, no row written.
//
// Why 200-with-no-action instead of Square's 401: the effect is the same
// fail-closed (an unverifiable request can never stamp a booking or start
// overtime accruing), but a stream of 401s risks igloohome disabling the
// subscription before we have even proved events arrive. A 200 keeps the
// deliveries flowing so the Vercel log tells us the two things we still don't
// know — whether events arrive at all, and the Bridge's log latency.
function verifySignature(req: NextRequest, rawBody: string): 'ok' | 'no_key' | 'bad' {
  const keyB64 = process.env.IGLOOHOME_WEBHOOK_PUBLIC_KEY
  if (!keyB64) return 'no_key'

  const signatureB64 = req.headers.get('x-igloocompany-sha256')
  if (!signatureB64) return 'bad'

  // Host and path must match what igloohome signed, which is the URL configured
  // in the portal — NOT necessarily the internal host Vercel hands us. Behind
  // the proxy, x-forwarded-host is the public one. IGLOOHOME_WEBHOOK_URL pins it
  // outright if the derived value ever disagrees; the mismatch is logged below
  // so a first-run failure is diagnosable instead of just "bad signature".
  const configured = process.env.IGLOOHOME_WEBHOOK_URL
  let host: string, path: string
  if (configured) {
    const u = new URL(configured)
    host = u.host
    path = u.pathname
  } else {
    host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
    path = new URL(req.url).pathname
  }

  const signedData = [
    'POST',
    host,
    path,
    req.headers.get('content-type') || 'application/json',
    req.headers.get('date') || '',
    rawBody,
  ].join('|')

  try {
    const publicKeyDer = Buffer.from(keyB64, 'base64')
    const digest = createHmac('sha256', publicKeyDer).update(signedData, 'ascii').digest()
    const ok = cryptoVerify(
      'sha256',
      digest,
      createPublicKey({ key: publicKeyDer, format: 'der', type: 'pkcs1' }),
      Buffer.from(signatureB64, 'base64')
    )
    if (!ok) {
      console.error('[igloohome webhook] signature mismatch. signed host/path used:', host, path)
    }
    return ok ? 'ok' : 'bad'
  } catch (e) {
    console.error('[igloohome webhook] signature verification threw:', e)
    return 'bad'
  }
}

// -- Bridge up/down state ----------------------------------------------------
//
// Records ONLY transitions. `changed_at` must mean "when this state began", so a
// Bridge that re-sends OFFLINE every minute must NOT keep pushing the clock
// forward — do that and it never looks 10 minutes old and the alert never fires.
// That is the whole bug this function exists to avoid.
async function recordBridgeState(deviceId: string, online: boolean): Promise<void> {
  try {
    const nowIso = new Date().toISOString()

    const { data: prev, error: readErr } = await supabase
      .from('bridge_status')
      .select('device_id, is_online')
      .eq('device_id', deviceId)
      .maybeSingle()
    // supabase-js never throws on a Postgres error; check it or this silently no-ops.
    if (readErr) {
      console.error('[igloohome webhook] bridge_status read failed:', readErr)
      return
    }

    const changed = !prev || prev.is_online !== online

    const { error: upErr } = await supabase.from('bridge_status').upsert({
      device_id: deviceId,
      is_online: online,
      last_event_at: nowIso,
      // Only move the clock on a real transition.
      ...(changed ? { changed_at: nowIso } : {}),
      // Recovery clears the latch so the NEXT outage can alert again.
      ...(online ? { alerted_at: null } : {}),
    }, { onConflict: 'device_id' })
    if (upErr) console.error('[igloohome webhook] bridge_status write failed:', upErr)
    else if (changed) {
      console.log(`[igloohome webhook] bridge ${deviceId} state change recorded: ${online ? 'online' : 'OFFLINE'}`)
    }
  } catch (e) {
    // Never let bookkeeping break the acknowledgement — igloohome retries on non-2xx.
    console.error('[igloohome webhook] recordBridgeState threw:', e)
  }
}

// -- Booking lookup ----------------------------------------------------------
//
// Find the confirmed booking that owns this PIN and whose window contains the
// entry. The time guard is not defensive padding — it is load-bearing:
//
//   * algoPINs CANNOT be revoked (they are derived from the lock's clock, not
//     stored on it). Moving a booking EARLIER leaves the guest holding a code
//     that still opens the door during the ORIGINAL window. Without the time
//     guard that stale code would check in the rescheduled booking.
//   * Codes are re-minted on extension and reschedule, so one booking can have
//     held several codes over its life, and a code can outlive its booking.
async function findBookingForPin(pin: string, entryAtMs: number) {
  // WARNING: pin is interpolated into a PostgREST .or() filter STRING, which is
  // not parameterised the way .eq() is. A value containing a comma, paren or dot
  // would not error — it would silently reparse into a DIFFERENT filter and
  // return the wrong bookings, which here means checking in a stranger. The lock
  // only ever reports digits, so anything else is refused rather than escaped.
  if (!/^[0-9]{4,12}$/.test(pin)) {
    console.error('[igloohome webhook] refusing non-numeric pin from activity log')
    return null
  }

  const lo = new Date(entryAtMs - PIN_WINDOW_SLACK_MS).toISOString()
  const hi = new Date(entryAtMs + PIN_WINDOW_SLACK_MS).toISOString()

  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, checked_in_at, door_code, door_code_back')
    .or(`door_code.eq.${pin},door_code_back.eq.${pin}`)
    .eq('status', 'confirmed')
    .lte('start_time', hi)   // started before the entry (+slack)
    .gte('end_time', lo)     // hadn't ended yet at the entry (-slack)

  if (error) {
    // supabase-js NEVER throws on a Postgres error — it resolves {data,error}.
    // Read it, or this silently becomes "no booking matched".
    console.error('[igloohome webhook] booking lookup failed:', error)
    return null
  }
  if (!data?.length) return null

  // Overlapping windows are possible (a guest with a morning and an evening
  // session, each with its own code — the visit-continuity rule makes those two
  // separate bookings). Prefer the one actually running at the entry time.
  const exact = data.find(
    (b: any) => Date.parse(b.start_time) <= entryAtMs && Date.parse(b.end_time) >= entryAtMs
  )
  return exact ?? data[0]
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const sig = verifySignature(req, rawBody)
  if (sig === 'bad') {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const event = body?.payload?.event
  const type = event?.type
  const deviceId: string | null = body?.payload?.product?.id ?? null

  // Bridge Connection (type 10). A Bridge that drops means check-in silently
  // stops working, which is exactly the class of failure this repo keeps
  // getting bitten by — so it is loud in the log even though nothing acts on it
  // yet. An owner alert here is the obvious next step once we trust the feed.
  if (type === 10) {
    const raw = body?.payload?.event?.data?.isOnline
    // WARNING: read this STRICTLY. An absent/renamed field is undefined, which is
    // falsy — treating that as "offline" would record a down Bridge that is fine
    // and page Teddy over a payload change. Unknown means unknown: log, write
    // nothing.
    const online = raw === true ? true : raw === false ? false : null

    console[online === false ? 'error' : 'log'](
      `[igloohome webhook] bridge ${deviceId} ${
        online === null
          ? `isOnline missing from payload (got ${JSON.stringify(raw)}) — state NOT recorded`
          : online
            ? 'ONLINE'
            : 'OFFLINE — door check-in is blind until it returns'
      }`
    )

    // Only a VERIFIED delivery may write state. Anyone can POST this shape at the
    // public endpoint, and a forged ONLINE would clear a real outage before the
    // cron ever saw it.
    if (online !== null && deviceId && sig === 'ok') {
      await recordBridgeState(deviceId, online)
    }
    return NextResponse.json({ ok: true })
  }

  if (type !== 5) {
    console.log(`[igloohome webhook] ignoring event type ${type}`)
    return NextResponse.json({ ok: true })
  }

  const logs: any[] = Array.isArray(event?.data?.activityLogs) ? event.data.activityLogs : []
  const receivedAt = Date.now()

  // Latency measurement — the open question we emailed igloohome about. Cheap
  // to log, and the only way we find out without waiting on their reply.
  if (logs.length) {
    const newest = Math.max(...logs.map((l) => Number(l?.entryDate) || 0)) * 1000
    if (newest > 0) {
      console.log(
        `[igloohome webhook] ${logs.length} log(s) from ${deviceId}; newest entry was ` +
        `${Math.round((receivedAt - newest) / 1000)}s before delivery`
      )
    }
  }

  if (sig === 'no_key') {
    console.warn(
      '[igloohome webhook] IGLOOHOME_WEBHOOK_PUBLIC_KEY not set — acknowledging without acting. ' +
      `Would have processed ${logs.length} activity log(s).`
    )
    return NextResponse.json({ ok: true, verified: false })
  }

  let checkedIn = 0

  for (const log of logs) {
    const logType = Number(log?.logType)
    const entrySec = Number(log?.entryDate)
    if (!Number.isFinite(logType) || !Number.isFinite(entrySec)) continue

    const entryAtMs = entrySec * 1000
    const pin: string | null = typeof log?.pin === 'string' ? log.pin : null

    let bookingId: string | null = null
    let didCheckIn = false

    if (PIN_UNLOCK_TYPES.has(logType) && pin) {
      const booking = await findBookingForPin(pin, entryAtMs)
      if (booking) {
        bookingId = booking.id
        // CLAIM on the null. Three things this handles at once: a redelivered
        // webhook, a re-entry (logType 19) later in the same session, and a
        // guest who already checked in at the desk or kiosk — none of which
        // should move an arrival time that is already recorded.
        // .select() because a blocked write returns no error, just no rows.
        const { data: claimed, error: upErr } = await supabase
          .from('bookings')
          .update({ checked_in_at: new Date(entryAtMs).toISOString() })
          .eq('id', booking.id)
          .is('checked_in_at', null)
          .select('id')

        if (upErr) console.error('[igloohome webhook] check-in write failed:', upErr)
        else if (claimed?.length) { didCheckIn = true; checkedIn++ }
      } else {
        // Not an error. A staff master PIN, or a code whose booking has moved.
        console.log(`[igloohome webhook] logType ${logType} at ${new Date(entryAtMs).toISOString()} matched no booking`)
      }
    }

    if (logType === 53) {
      console.error(`[igloohome webhook] ATTEMPTED BREAK-IN reported by ${deviceId} at ${new Date(entryAtMs).toISOString()}`)
    }

    // Everything lands in door_events, matched or not — an unmatched entry is
    // the interesting one when something goes wrong. Dedupe is the partial
    // unique index in migration 102; a duplicate delivery is expected, not a
    // failure, so 23505 is swallowed rather than logged as an error.
    const { error: insErr } = await supabase.from('door_events').insert({
      event_id:   event?.id ?? null,
      device_id:  deviceId,
      log_type:   logType,
      entry_at:   new Date(entryAtMs).toISOString(),
      pin,
      raw:        log,
      booking_id: bookingId,
      checked_in: didCheckIn,
    })
    if (insErr && insErr.code !== '23505') {
      console.error('[igloohome webhook] door_events insert failed:', insErr)
    }
  }

  return NextResponse.json({ ok: true, logs: logs.length, checkedIn })
}
