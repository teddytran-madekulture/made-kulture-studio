// Apple Push Notification service — direct HTTP/2 sender (2026-10-07).
// Used by lib/member-push.ts for the iPhone app. No Firebase on iOS: the
// Capacitor PushNotifications plugin hands us the raw APNs device token.
//
// Env (Vercel):
//   APNS_KEY_ID       the 10-char Key ID of the APNs auth key (.p8)
//   APNS_PRIVATE_KEY  the .p8 file contents (newlines may be pasted as \n)
//   APNS_TEAM_ID      optional, defaults to 3WWCP2ML95
//   APNS_TOPIC        optional, defaults to com.madekulture.app
//
// TestFlight and App Store builds both use the PRODUCTION APNs host.
import http2 from 'node:http2'
import crypto from 'node:crypto'

const HOST = 'https://api.push.apple.com'

export function apnsConfigured(): boolean {
  return !!process.env.APNS_KEY_ID && !!process.env.APNS_PRIVATE_KEY
}

let jwtCache: { token: string; at: number } | null = null

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// The .p8 pasted into Vercel's one-line value box loses its line breaks (or
// keeps them as literal \n). Rebuild a proper PEM either way: take the base64
// body, re-wrap at 64 chars, put the header/footer back.
function normalizePem(raw: string): string {
  const body = raw
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) ?? []
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
}

// Apple wants the provider token refreshed at most every 20 min and at least
// every 60 — reuse for 45.
function providerToken(): string {
  if (jwtCache && Date.now() - jwtCache.at < 45 * 60_000) return jwtCache.token
  const key = normalizePem(process.env.APNS_PRIVATE_KEY || '')
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }))
  const claims = b64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID || '3WWCP2ML95', iat: Math.floor(Date.now() / 1000) }))
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  const token = `${header}.${claims}.${b64url(sig)}`
  jwtCache = { token, at: Date.now() }
  return token
}

export type ApnsResult = { token: string; ok: boolean; status: number; reason?: string; dead: boolean }

/** Sends one alert to each device token. Never throws. `dead` = Apple says the
 *  token will never work again (uninstalled / wrong app) — prune it. */
export async function sendApns(
  tokens: string[],
  msg: { title: string; body: string; url?: string; tag?: string },
): Promise<ApnsResult[]> {
  if (!tokens.length) return []
  if (!apnsConfigured()) return tokens.map(t => ({ token: t, ok: false, status: 0, reason: 'not configured', dead: false }))

  let jwt: string
  try { jwt = providerToken() } catch (e: any) {
    console.error('[apns] could not sign provider token — check APNS_PRIVATE_KEY:', e?.message)
    return tokens.map(t => ({ token: t, ok: false, status: 0, reason: 'bad key', dead: false }))
  }

  const payload = JSON.stringify({
    aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', ...(msg.tag ? { 'thread-id': msg.tag } : {}) },
    url: msg.url ?? '/account',
  })

  const client = http2.connect(HOST)
  client.on('error', e => console.error('[apns] connection error:', e.message))
  try {
    return await Promise.all(tokens.map(token => new Promise<ApnsResult>(resolve => {
      let status = 0, data = '', done = false
      const finish = (r: ApnsResult) => { if (!done) { done = true; resolve(r) } }
      const headers: Record<string, string> = {
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': process.env.APNS_TOPIC || 'com.madekulture.app',
        'apns-push-type': 'alert',
        'apns-priority': '10',
      }
      if (msg.tag) headers['apns-collapse-id'] = msg.tag.slice(0, 64)
      const req = client.request(headers)
      req.setEncoding('utf8')
      req.on('response', h => { status = Number(h[':status']) || 0 })
      req.on('data', d => { data += d })
      req.on('end', () => {
        let reason: string | undefined
        try { reason = data ? JSON.parse(data).reason : undefined } catch {}
        const dead = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic'
        if (status !== 200) console.error('[apns] rejected', status, reason)
        finish({ token, ok: status === 200, status, reason, dead })
      })
      req.on('error', e => finish({ token, ok: false, status: 0, reason: e.message, dead: false }))
      req.setTimeout(10_000, () => { req.close(); finish({ token, ok: false, status: 0, reason: 'timeout', dead: false }) })
      req.end(payload)
    })))
  } finally {
    client.close()
  }
}
