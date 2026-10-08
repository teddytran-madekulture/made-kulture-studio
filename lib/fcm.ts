// Firebase Cloud Messaging (HTTP v1) sender for the Android app (2026-10-07).
// Used by lib/member-push.ts. iOS goes straight to Apple (lib/apns.ts);
// Android has no equivalent, so it goes through Google's FCM.
//
// Env (Vercel):
//   FCM_SERVICE_ACCOUNT  the Firebase service-account JSON (Project settings →
//                        Service accounts → Generate new private key). Paste the
//                        whole file; base64 of it also works.
//
// Auth: a short RS256 JWT signed with the service account's private key is
// swapped for an OAuth access token (cached ~50 min), then each message is a
// POST to projects/<id>/messages:send.
import crypto from 'node:crypto'

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

export function fcmConfigured(): boolean {
  return !!process.env.FCM_SERVICE_ACCOUNT
}

let saCache: ServiceAccount | null = null
function serviceAccount(): ServiceAccount {
  if (saCache) return saCache
  let raw = (process.env.FCM_SERVICE_ACCOUNT ?? '').trim()
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8')
  const sa = JSON.parse(raw)
  // Vercel can turn the key's newlines into literal \n — put them back.
  sa.private_key = String(sa.private_key ?? '').replace(/\\n/g, '\n')
  if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('FCM_SERVICE_ACCOUNT is missing fields')
  saCache = sa
  return sa
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

let tokenCache: { token: string; exp: number } | null = null
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token
  const sa = serviceAccount()
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }),
  })
  const j: any = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw new Error(`FCM auth failed: ${res.status} ${j.error ?? ''}`)
  tokenCache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 10 * 60_000 }
  return j.access_token
}

export type FcmResult = { token: string; ok: boolean; dead: boolean; status: number }

/** Send one notification to each token. Never throws — failures come back per
 *  token; `dead` means Google says the token is gone (prune it). */
export async function sendFcm(tokens: string[], msg: { title: string; body: string; url?: string; tag?: string }): Promise<FcmResult[]> {
  if (!fcmConfigured() || tokens.length === 0) return tokens.map(t => ({ token: t, ok: false, dead: false, status: 0 }))
  let sa: ServiceAccount, bearer: string
  try { sa = serviceAccount(); bearer = await accessToken() }
  catch (e) {
    console.error('[fcm]', (e as Error).message)
    return tokens.map(t => ({ token: t, ok: false, dead: false, status: 0 }))
  }
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  return Promise.all(tokens.map(async (token): Promise<FcmResult> => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            // The app reads data.url on tap (lib/native-push.ts) — same as iOS.
            data: { url: msg.url ?? '/account' },
            android: {
              priority: 'HIGH',
              ...(msg.tag ? { collapse_key: msg.tag.slice(0, 64) } : {}),
              notification: { sound: 'default', ...(msg.tag ? { tag: msg.tag.slice(0, 64) } : {}) },
            },
          },
        }),
      })
      if (res.ok) return { token, ok: true, dead: false, status: res.status }
      const j: any = await res.json().catch(() => ({}))
      const code = j?.error?.details?.find((d: any) => d?.errorCode)?.errorCode ?? j?.error?.status
      const dead = res.status === 404 || code === 'UNREGISTERED' || (res.status === 400 && /registration token/i.test(j?.error?.message ?? ''))
      if (!dead) console.error('[fcm] send failed', res.status, code)
      return { token, ok: false, dead, status: res.status }
    } catch (e) {
      console.error('[fcm] send error', (e as Error).message)
      return { token, ok: false, dead: false, status: 0 }
    }
  }))
}
