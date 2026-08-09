// igloohome API — per-booking door codes (algoPIN, offline).
//
// On a confirmed booking we mint an *hourly* algoPIN valid for the booking
// window on the front-door lock — and, when a back-door lock is configured, a
// second algoPIN on the back door for the same window. algoPINs are computed
// offline against each lock's own clock + unique algorithm, so a code is
// specific to ONE lock (the same PIN can't open both doors) and expires on its
// own without wifi/bridge.
//
// Auth:  POST https://auth.igloohome.co/oauth2/token  (Basic client_id:secret,
//        grant_type=client_credentials). Token is a JWT valid ~24h; cached here.
//        The same API account owns both locks, so one token covers both.
// PIN:   POST https://api.igloodeveloper.co/igloohome/devices/{deviceId}/algopin/hourly
//        body { variance, startDate, endDate, accessName } → { pin, pinId }
//
// Env (set in Vercel from Bitwarden "igloohome API – Made Kulture"):
//   IGLOOHOME_CLIENT_ID, IGLOOHOME_CLIENT_SECRET  — shared API credentials
//   IGLOOHOME_DEVICE_ID       — front-door lock (DBX211001490)
//   IGLOOHOME_DEVICE_ID_BACK  — back-door lock (optional; while unset the
//                               back-door code feature stays dormant and the
//                               front door behaves exactly as before)
// If the client creds or the front-door device id are missing the front-door
// feature is dormant (createBookingPin returns null) so bookings keep working
// before the env vars are wired up.

import { centralOffsetMinutesAt } from '@/lib/booking-times'

const AUTH_URL = 'https://auth.igloohome.co/oauth2/token'
const API_BASE = 'https://api.igloodeveloper.co'
const PIN_SCOPE = 'igloohomeapi/algopin-hourly'

// hourly algoPIN window limits (per igloohome): 1–672 hours.
const HOUR_MS = 60 * 60 * 1000
const MIN_WINDOW_MS = HOUR_MS                // 1 hour
const MAX_WINDOW_MS = 672 * HOUR_MS          // 28 days

// Shared API credentials (the same igloohome account owns every lock).
function apiCreds() {
  const clientId = process.env.IGLOOHOME_CLIENT_ID
  const clientSecret = process.env.IGLOOHOME_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

function frontDeviceId() { return process.env.IGLOOHOME_DEVICE_ID || null }
function backDeviceId()  { return process.env.IGLOOHOME_DEVICE_ID_BACK || null }

// ── Token cache (module-scoped; fine for serverless warm invocations) ──────────
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: PIN_SCOPE }),
  })
  if (!res.ok) throw new Error(`igloohome auth failed: ${res.status} ${await res.text()}`)
  const json: any = await res.json()
  if (!json.access_token) throw new Error('igloohome auth: no access_token in response')
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 86400) * 1000,
  }
  return cachedToken.value
}

// Format an absolute instant as Central wall-clock, matching the shape the
// booking flow stores. The offset is read from the timezone database for THIS
// instant, not assumed to be CDT — a PIN minted an hour off doesn't look wrong,
// it locks a guest out of the building.
function toCentralISO(ms: number): string {
  const offMin = centralOffsetMinutesAt(new Date(ms))
  const d = new Date(ms + offMin * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  const sign = offMin <= 0 ? '-' : '+'
  const abs  = Math.abs(offMin)
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` +
    `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
}

export interface BookingPin {
  pin: string
  pinId: string | null
}

// Core: mint an hourly algoPIN on a specific lock for [startISO, endISO].
// startISO/endISO are the booking window (ISO strings, any parseable offset).
// Throws on an invalid window or a real API error (callers treat it as non-fatal).
async function mintHourlyPin(deviceId: string, opts: {
  startISO: string
  endISO: string
  accessName: string
}): Promise<BookingPin> {
  const c = apiCreds()
  if (!c) throw new Error('igloohome: missing API credentials')

  const s0 = Date.parse(opts.startISO)
  const e0 = Date.parse(opts.endISO)
  if (!Number.isFinite(s0) || !Number.isFinite(e0) || e0 <= s0) {
    throw new Error(`igloohome: invalid window ${opts.startISO}–${opts.endISO}`)
  }
  // Hourly algoPINs require whole-hour boundaries (minutes/seconds = 00). Floor
  // the start to the top of the hour and ceil the end up to the next hour — which
  // also gives the guest a little early-access + grace on either side. (-05:00 is
  // a whole-hour offset, so flooring the epoch to the hour lands on :00 locally.)
  let start = Math.floor(s0 / HOUR_MS) * HOUR_MS
  let end   = Math.ceil(e0 / HOUR_MS) * HOUR_MS
  // Clamp to the hourly algoPIN allowed range (1–672 hours).
  if (end - start < MIN_WINDOW_MS) end = start + MIN_WINDOW_MS
  if (end - start > MAX_WINDOW_MS) end = start + MAX_WINDOW_MS

  const token = await getAccessToken(c.clientId, c.clientSecret)
  const res = await fetch(
    `${API_BASE}/igloohome/devices/${encodeURIComponent(deviceId)}/algopin/hourly`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        variance: 1,
        startDate: toCentralISO(start),
        endDate: toCentralISO(end),
        accessName: opts.accessName.slice(0, 40),
      }),
    }
  )
  if (!res.ok) throw new Error(`igloohome algoPIN failed: ${res.status} ${await res.text()}`)
  const json: any = await res.json()
  if (!json.pin) throw new Error('igloohome algoPIN: no pin in response')
  return { pin: String(json.pin), pinId: json.pinId ?? null }
}

// Front-door algoPIN for [startISO, endISO]. Returns null if the feature isn't
// configured (missing creds or front-door device id); throws on a real API error.
export async function createBookingPin(opts: {
  startISO: string
  endISO: string
  accessName: string
}): Promise<BookingPin | null> {
  const deviceId = frontDeviceId()
  if (!apiCreds() || !deviceId) return null
  return mintHourlyPin(deviceId, opts)
}

// Back-door algoPIN for the same window. Returns null when no back-door lock is
// configured (IGLOOHOME_DEVICE_ID_BACK unset), so the back-door feature stays
// dormant until the second lock is paired and its device id is added to Vercel.
export async function createBackDoorPin(opts: {
  startISO: string
  endISO: string
  accessName: string
}): Promise<BookingPin | null> {
  const deviceId = backDeviceId()
  if (!apiCreds() || !deviceId) return null
  return mintHourlyPin(deviceId, opts)
}

// True when the front-door code feature is configured (used to gate DB writes/UI).
export function doorCodesEnabled(): boolean {
  return apiCreds() !== null && frontDeviceId() !== null
}

// True when the back-door lock is configured.
export function backDoorEnabled(): boolean {
  return apiCreds() !== null && backDeviceId() !== null
}

// ─── Issue + store both codes for one booking ─────────────────────────────────
//
// Mints the front-door algoPIN (and the back-door one when that lock is
// configured) for [startISO, endISO] and writes them onto the booking row.
//
// NON-FATAL BY DESIGN: a lock or network failure must never fail a booking that
// is already confirmed and possibly paid for. Every failure is logged and the
// caller gets nulls back.
//
// Front and back are written SEPARATELY so a missing `door_code_back` column
// (migration 081 not run on this environment) can never roll back the
// front-door code, which is the one that matters.
//
// ⚠️ algoPINs cannot be revoked — they are derived from the lock's clock, not
// stored on it. Re-minting for a NEW window does not kill the old code; the old
// code simply stops working at its own end time. So when a booking moves
// EARLIER, the guest still holds a working code for the original window.
export async function issueDoorCodes(
  supabase: any,
  bookingId: string,
  opts: { startISO: string; endISO: string; accessName: string }
): Promise<{ doorCode: string | null; doorCodeBack: string | null }> {
  let doorCode: string | null = null
  let doorCodeBack: string | null = null

  try {
    const pin = await createBookingPin(opts)
    if (pin) {
      // .select() so a blocked/no-op write is visible instead of silently
      // reporting success — see the silent-failure rules.
      const { data, error } = await supabase
        .from('bookings')
        .update({ door_code: pin.pin, door_code_pin_id: pin.pinId })
        .eq('id', bookingId)
        .select('id')
      if (error || !data?.length) {
        console.error('[igloohome] front-door code minted but NOT stored on booking', bookingId, error)
      }
      // Return it either way — a minted code the guest can use beats nothing,
      // even if the row write failed.
      doorCode = pin.pin
    }
  } catch (e) {
    console.error('[igloohome] front-door code error (non-fatal):', e)
  }

  try {
    const pinBack = await createBackDoorPin({ ...opts, accessName: `${opts.accessName} back`.slice(0, 40) })
    if (pinBack) {
      const { data, error } = await supabase
        .from('bookings')
        .update({ door_code_back: pinBack.pin, door_code_back_pin_id: pinBack.pinId })
        .eq('id', bookingId)
        .select('id')
      if (error || !data?.length) {
        console.error('[igloohome] back-door code minted but NOT stored on booking', bookingId, error)
      }
      doorCodeBack = pinBack.pin
    }
  } catch (e) {
    console.error('[igloohome] back-door code error (non-fatal):', e)
  }

  return { doorCode, doorCodeBack }
}
