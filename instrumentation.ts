// 2026-10-14 — LOG SCRUBBER. The Square SDK's ApiError carries the full HTTP
// request, INCLUDING `authorization: 'Bearer <live access token>'`, and ~200
// places in this app do `console.error('…', e)`. So every declined card wrote
// the production Square token into the Vercel runtime logs in plain text
// (found reading Christopher Joseph's CARD_EXPIRED failures). Rather than
// patch 200 call sites, this wraps console once per server instance:
//   • any Square-style error (has .request / .statusCode / .errors) is logged
//     as a small summary — status, error codes, payment id, card last 4;
//   • any string that still contains a bearer token or a Square access token
//     shape (EAAA…) is masked.
// Runs in the Node runtime only; edge routes don't call Square.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const g = globalThis as any
  if (g.__mkLogScrubber) return
  g.__mkLogScrubber = true

  const TOKEN_RE = /(Bearer\s+)[A-Za-z0-9._\-]{12,}|\bEAAA[A-Za-z0-9._\-]{20,}/g
  const maskStr = (s: string) => s.replace(TOKEN_RE, (_m, bearer) => (bearer ? `${bearer}[redacted]` : '[redacted]'))

  const summarize = (e: any) => {
    let payment: any = e?.result?.payment
    if (!payment && typeof e?.body === 'string') {
      try { payment = JSON.parse(e.body)?.payment } catch { /* not JSON */ }
    }
    const card = payment?.card_details?.card ?? payment?.cardDetails?.card
    return {
      squareError: true,
      message: maskStr(String(e?.message ?? '')),
      statusCode: e?.statusCode,
      method: e?.request?.method,
      url: e?.request?.url,
      errors: (e?.errors ?? e?.result?.errors ?? []).map((x: any) => ({ code: x?.code, detail: x?.detail, field: x?.field })),
      paymentId: payment?.id,
      card: card ? `${card.card_brand ?? card.cardBrand ?? ''} ${card.last_4 ?? card.last4 ?? ''} exp ${card.exp_month ?? card.expMonth ?? '?'}/${card.exp_year ?? card.expYear ?? '?'}` : undefined,
    }
  }

  const clean = (a: any): any => {
    if (typeof a === 'string') return maskStr(a)
    if (a && typeof a === 'object' && (a.request?.headers || (a.statusCode && (a.errors || a.result)))) {
      try { return summarize(a) } catch { return '[square error — details redacted]' }
    }
    return a
  }

  for (const level of ['error', 'warn', 'log', 'info'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: any[]) => {
      let out = args
      try { out = args.map(clean) } catch { /* never break logging */ }
      orig(...out)
    }
  }
}
