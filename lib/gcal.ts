// Google Calendar sync — mirror confirmed bookings onto the studio's
// madekulture Google Calendar via a service account.
//
// Auth: service-account JWT bearer flow (RS256 signed with node:crypto — no
// googleapis dependency). Token endpoint https://oauth2.googleapis.com/token,
// scope calendar.events. Token cached module-scope like lib/igloohome.ts.
//
// Env (set in Vercel; see GCal_Sync_Setup.md in the workspace root):
//   GCAL_SERVICE_ACCOUNT_EMAIL   e.g. mk-calendar@<project>.iam.gserviceaccount.com
//   GCAL_PRIVATE_KEY             the service account private key (\n-escaped ok)
//   GCAL_CALENDAR_ID             the madekulture calendar id (its gmail address,
//                                or the long ...@group.calendar.google.com id)
//
// If any env var is missing the feature is dormant (helpers return null/no-op)
// so bookings keep working before setup. On top of the env gate there's a
// runtime on/off switch: studio_settings key `gcal_sync_enabled` ('true'/'false'),
// editable from the admin dashboard without a deploy.

import { createSign } from 'crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const API_BASE = 'https://www.googleapis.com/calendar/v3'

function creds() {
  const email = process.env.GCAL_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GCAL_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const calendarId = process.env.GCAL_CALENDAR_ID
  if (!email || !key || !calendarId) return null
  return { email, key, calendarId }
}

// True when the calendar-sync feature has its env vars (used to gate UI/writes).
export function gcalConfigured(): boolean {
  return creds() !== null
}

// ── Token cache (module-scoped; fine for serverless warm invocations) ──────────
let cachedToken: { value: string; expiresAt: number } | null = null

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

async function getAccessToken(email: string, key: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(key).toString('base64url')
  const assertion = `${header}.${claims}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) throw new Error(`gcal auth failed: ${res.status} ${await res.text()}`)
  const json: any = await res.json()
  if (!json.access_token) throw new Error('gcal auth: no access_token in response')
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  }
  return cachedToken.value
}

// ── Runtime on/off switch ──────────────────────────────────────────────────────
// Reads studio_settings.gcal_sync_enabled with any Supabase client the caller
// already has (service-role or user — the table is readable server-side).
// Missing row counts as OFF so the feature never fires before migration 049.
export async function gcalSyncEnabled(supabase: any): Promise<boolean> {
  if (!gcalConfigured()) return false
  try {
    const { data } = await supabase
      .from('studio_settings').select('value').eq('key', 'gcal_sync_enabled').single()
    return data?.value === 'true'
  } catch {
    return false
  }
}

// ── Event helpers ──────────────────────────────────────────────────────────────

export interface GcalBookingEvent {
  summary: string
  description?: string
  location?: string
  startISO: string   // any parseable ISO (e.g. 2026-07-10T14:00:00-05:00)
  endISO: string
}

// Create an event on the studio calendar. Returns the Google event id (store it
// on the booking row so cancel/reschedule can find the event later), or null
// when the feature isn't configured. Throws on a real API error — callers treat
// it as non-fatal and log.
export async function createCalendarEvent(e: GcalBookingEvent): Promise<string | null> {
  const c = creds()
  if (!c) return null
  const token = await getAccessToken(c.email, c.key)
  const res = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(c.calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: e.summary,
        ...(e.description ? { description: e.description } : {}),
        ...(e.location ? { location: e.location } : {}),
        start: { dateTime: new Date(e.startISO).toISOString(), timeZone: 'America/Chicago' },
        end:   { dateTime: new Date(e.endISO).toISOString(),   timeZone: 'America/Chicago' },
      }),
    }
  )
  if (!res.ok) throw new Error(`gcal create failed: ${res.status} ${await res.text()}`)
  const json: any = await res.json()
  return json.id ?? null
}

// Update an event's time window (admin reschedule). No-op when unconfigured.
export async function patchCalendarEvent(
  eventId: string,
  patch: Partial<Pick<GcalBookingEvent, 'summary' | 'startISO' | 'endISO'>>
): Promise<void> {
  const c = creds()
  if (!c || !eventId) return
  const token = await getAccessToken(c.email, c.key)
  const body: any = {}
  if (patch.summary) body.summary = patch.summary
  if (patch.startISO) body.start = { dateTime: new Date(patch.startISO).toISOString(), timeZone: 'America/Chicago' }
  if (patch.endISO)   body.end   = { dateTime: new Date(patch.endISO).toISOString(),   timeZone: 'America/Chicago' }
  if (!Object.keys(body).length) return
  const res = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(c.calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  // 404/410 = event already gone (deleted by hand on the calendar) — fine.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`gcal patch failed: ${res.status} ${await res.text()}`)
  }
}

// Delete an event (booking cancelled). Missing/already-deleted events are fine.
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const c = creds()
  if (!c || !eventId) return
  const token = await getAccessToken(c.email, c.key)
  const res = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(c.calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`gcal delete failed: ${res.status} ${await res.text()}`)
  }
}
