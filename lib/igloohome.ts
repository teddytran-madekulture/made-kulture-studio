// igloohome API — per-booking door codes (algoPIN, offline).
//
// On a confirmed booking we mint an *hourly* algoPIN valid for the booking
// window on the front-door lock. algoPINs are computed offline against the
// lock's clock, so they work without wifi/bridge and expire on their own.
//
// Auth:  POST https://auth.igloohome.co/oauth2/token  (Basic client_id:secret,
//        grant_type=client_credentials). Token is a JWT valid ~24h; cached here.
// PIN:   POST https://api.igloodeveloper.co/igloohome/devices/{deviceId}/algopin/hourly
//        body { variance, startDate, endDate, accessName } → { pin, pinId }
//
// Env (set in Vercel from Bitwarden "igloohome API – Made Kulture"):
//   IGLOOHOME_CLIENT_ID, IGLOOHOME_CLIENT_SECRET, IGLOOHOME_DEVICE_ID
// If any is missing the feature is dormant (createBookingPin returns null) so
// bookings keep working before the env vars are wired up.

const AUTH_URL = 'https://auth.igloohome.co/oauth2/token'
const API_BASE = 'https://api.igloodeveloper.co'
const PIN_SCOPE = 'igloohomeapi/algopin-hourly'

// hourly algoPIN window limits (per igloohome): 1–672 hours.
const HOUR_MS = 60 * 60 * 1000
const MIN_WINDOW_MS = HOUR_MS                // 1 hour
const MAX_WINDOW_MS = 672 * HOUR_MS          // 28 days

function creds() {
  const clientId = process.env.IGLOOHOME_CLIENT_ID
  const clientSecret = process.env.IGLOOHOME_CLIENT_SECRET
  const deviceId = process.env.IGLOOHOME_DEVICE_ID
  if (!clientId || !clientSecret || !deviceId) return null
  return { clientId, clientSecret, deviceId }
}

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

// Format an absolute instant as wall-clock at Central (UTC-05:00), matching the
// -05:00 ISO the booking flow already uses (studio is America/Chicago; DST/CDT).
function toCentralISO(ms: number): string {
  const d = new Date(ms - 5 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}-05:00`
}

export interface BookingPin {
  pin: string
  pinId: string | null
}

// Generate an hourly algoPIN for [startISO, endISO] on the front-door lock.
// startISO/endISO are the booking window (ISO strings, any parseable offset).
// Returns null if the feature isn't configured; throws on a real API error so
// the caller can log it (callers treat it as non-fatal).
export async function createBookingPin(opts: {
  startISO: string
  endISO: string
  accessName: string
}): Promise<BookingPin | null> {
  const c = creds()
  if (!c) return null

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
    `${API_BASE}/igloohome/devices/${encodeURIComponent(c.deviceId)}/algopin/hourly`,
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

// True when the door-code feature is configured (used to gate DB writes/UI).
export function doorCodesEnabled(): boolean {
  return creds() !== null
}
