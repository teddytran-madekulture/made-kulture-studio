// Drops a corrupted Supabase session cookie instead of letting it crash the page.
// Added 2026-10-08.
//
// What happened: after a Google/Apple sign-in inside the iPhone app, every
// signed-in page 500'd ("Invalid UTF-8 sequence" thrown from @supabase/ssr's
// cookie getItem) and middleware failed with MIDDLEWARE_INVOCATION_FAILED.
// The session cookie is split into chunks (sb-<ref>-auth-token.0, .1, ...);
// when the pieces in the browser don't belong together (e.g. a leftover chunk
// from an earlier, longer session) the joined value is not valid base64 /
// UTF-8 and the library throws on EVERY request -- the person is locked out
// until the cookies are cleared, which an app user cannot do.
//
// Fix: before handing cookies to Supabase, rebuild each auth-token the same way
// the library does and try to decode it. If it doesn't decode, leave those
// cookies out (the request is simply signed out) and report their names so
// middleware can delete them from the browser. Works in Edge (no Buffer).

type C = { name: string; value: string }

const AUTH_RE = /^(sb-.+-auth-token(?:-code-verifier)?)(?:\.(\d+))?$/

function decodes(raw: string): boolean {
  try {
    let v = raw
    if (v.startsWith('base64-')) {
      let b = v.slice(7).replace(/-/g, '+').replace(/_/g, '/')
      while (b.length % 4) b += '='
      const bin = atob(b)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      v = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    JSON.parse(v)
    return true
  } catch {
    return false
  }
}

export function safeAuthCookies<T extends C>(all: T[]): { cookies: T[]; bad: string[] } {
  const byBase = new Map<string, T[]>()
  for (const c of all) {
    const m = AUTH_RE.exec(c.name)
    if (!m) continue
    const list = byBase.get(m[1]) || []
    list.push(c)
    byBase.set(m[1], list)
  }
  const bad: string[] = []
  byBase.forEach((parts, base) => {
    const whole = parts.find((p) => p.name === base)
    if (whole) {
      // An unchunked cookie wins; any numbered chunks beside it are leftovers.
      if (!decodes(whole.value)) bad.push(whole.name)
      parts.forEach((p) => { if (p !== whole) bad.push(p.name) })
      return
    }
    const chunks: T[] = []
    for (let i = 0; ; i++) {
      const p = parts.find((x) => x.name === `${base}.${i}`)
      if (!p) break
      chunks.push(p)
    }
    // The common corruption is a LEFTOVER chunk: a session that needed 3
    // chunks (Google/Apple tokens are long) is replaced by one that needs 2,
    // and the old .2 is never deleted, so the library glues it on the end.
    // Find the first run .0..k that decodes, keep it, drop the rest.
    let keep = 0
    let joined = ''
    for (let k = 0; k < chunks.length; k++) {
      joined += chunks[k].value
      if (decodes(joined)) { keep = k + 1; break }
    }
    parts.forEach((p) => { if (!chunks.slice(0, keep).includes(p)) bad.push(p.name) })
  })
  if (!bad.length) return { cookies: all, bad }
  console.warn('[auth] dropped unreadable session cookies:', bad.join(', '))
  return { cookies: all.filter((c) => !bad.includes(c.name)), bad }
}

/** Every Supabase auth cookie name present (session chunks + PKCE verifier). */
export function authCookieNames(all: C[]): string[] {
  return all.filter((c) => AUTH_RE.test(c.name)).map((c) => c.name)
}

/** Browser side: delete unreadable/leftover auth cookies from document.cookie. */
export function cleanBrowserAuthCookies(): void {
  if (typeof document === 'undefined') return
  try {
    const all = document.cookie.split(';').map((p) => {
      const i = p.indexOf('=')
      const name = p.slice(0, i).trim()
      let value = p.slice(i + 1).trim()
      try { value = decodeURIComponent(value) } catch {}
      return { name, value }
    }).filter((c) => c.name)
    const { bad } = safeAuthCookies(all)
    bad.forEach((n) => { document.cookie = `${n}=; Max-Age=0; path=/` })
  } catch {}
}
