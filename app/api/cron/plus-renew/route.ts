import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Client, Environment } from 'square'
import { sendSimpleEmail } from '@/lib/email'
import { sendSMS, sendOwnerSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

function getSquare() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN!,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
  })
}

function addYear(fromIso: string): string { const d = new Date(fromIso); d.setFullYear(d.getFullYear() + 1); return d.toISOString() }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }

// GET /api/cron/plus-renew  (daily, Bearer CRON_SECRET; scheduled via pg_cron)
// 1. Reminder ~N days before expiry.
// 2. On/after expiry (small grace window): auto-charge the saved card, extend a
//    year, receipt. Skips comp / opted-out / suspended / no-card members.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: settingRows } = await supabase
    .from('studio_settings').select('key, value').in('key', ['plus_annual_price_cents', 'plus_renew_reminder_days'])
  const sm: Record<string, string> = {}; for (const r of settingRows ?? []) sm[r.key] = r.value
  const priceCents   = Number(sm['plus_annual_price_cents']) > 0 ? Number(sm['plus_annual_price_cents']) : 9900
  const reminderDays = Number(sm['plus_renew_reminder_days']) > 0 ? Number(sm['plus_renew_reminder_days']) : 7

  const now = Date.now()
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, phone, square_customer_id, pricing_overrides')
    .not('pricing_overrides', 'is', null)

  const square = getSquare()
  let reminders = 0, renewed = 0, failed = 0

  for (const c of customers ?? []) {
    const po: any = c.pricing_overrides || {}
    if (!po.plus || !po.plus_expires_at || po.plus_comp) continue
    const expMs = new Date(po.plus_expires_at).getTime()
    if (!Number.isFinite(expMs)) continue
    const daysUntil = (expMs - now) / 86_400_000
    const autoRenew = po.plus_auto_renew === true
    const suspended = po.plus_renewal_suspended === true
    const dollars = (priceCents / 100).toFixed(2)

    // ── 1. Reminder before renewal ──
    if (autoRenew && !suspended && daysUntil > 0 && daysUntil <= reminderDays && po.plus_reminder_sent_for !== po.plus_expires_at) {
      if (c.email) await sendSimpleEmail({
        to: c.email,
        subject: `Your Made Kulture Plus renews ${fmtDate(po.plus_expires_at)}`,
        heading: 'Your Plus membership renews soon',
        paragraphs: [
          `Heads up — your Made Kulture Plus membership renews on <strong style="color:#fff;">${fmtDate(po.plus_expires_at)}</strong> for <strong style="color:#fff;">$${dollars}</strong>, charged to your card on file.`,
          `Want to stop it? Turn off auto-renew anytime from your account — no charge if you cancel before that date.`,
        ],
        ctaText: 'Manage membership', ctaUrl: `${APP_URL}/account`, label: 'plus_renew_reminder',
      }).catch(() => {})
      if (c.phone) await sendSMS(c.phone, `Made Kulture: your Plus membership renews ${fmtDate(po.plus_expires_at)} for $${dollars}. Turn off auto-renew in your account to stop it: ${APP_URL}/account`).catch(() => {})
      po.plus_reminder_sent_for = po.plus_expires_at
      await supabase.from('customers').update({ pricing_overrides: po }).eq('id', c.id)
      reminders++
      continue
    }

    // ── 2. Renewal charge (from expiry through a 3-day grace) ──
    const daysPast = -daysUntil
    if (!(daysPast >= 0 && daysPast <= 3 && autoRenew && !suspended)) continue

    const notifyFailOnce = async (heading: string, para: string) => {
      if (po.plus_renew_notified_for === po.plus_expires_at) return
      if (c.email) await sendSimpleEmail({ to: c.email, subject: 'Action needed: your Made Kulture Plus renewal', heading, paragraphs: [para], ctaText: 'Renew Plus', ctaUrl: `${APP_URL}/account/plus`, label: 'plus_renew_failed' }).catch(() => {})
      po.plus_renew_notified_for = po.plus_expires_at
      await supabase.from('customers').update({ pricing_overrides: po }).eq('id', c.id)
    }

    if (!c.square_customer_id) { await notifyFailOnce('We couldn’t renew your membership', 'We don’t have a card on file to renew your Plus membership. Re-subscribe anytime to keep your benefits.'); failed++; continue }

    let cardId: string | null = null
    try {
      const cardsRes = await square.cardsApi.listCards(undefined, c.square_customer_id)
      cardId = (cardsRes.result.cards ?? []).find(x => x.enabled)?.id ?? null
    } catch { /* fall through */ }
    if (!cardId) { await notifyFailOnce('We couldn’t renew your membership', 'Your card on file couldn’t be used to renew Plus. Add a card and re-subscribe to keep your benefits.'); failed++; continue }

    // Stable idempotency key per member per period → no double charge.
    const idem = `pr-${String(c.id).replace(/-/g, '').slice(0, 20)}-${String(po.plus_expires_at).slice(0, 10).replace(/-/g, '')}`
    try {
      const pay = await square.paymentsApi.createPayment({
        sourceId: cardId, customerId: c.square_customer_id, idempotencyKey: idem,
        amountMoney: { amount: BigInt(priceCents), currency: 'USD' },
        locationId: process.env.SQUARE_LOCATION_ID!, note: 'Made Kulture — Plus membership renewal',
        buyerEmailAddress: c.email || undefined,
      })
      const payId = pay.result.payment?.id ?? null
      const startIso = new Date().toISOString()
      const newExp = addYear(po.plus_expires_at) // keep the anniversary
      po.plus_started_at = startIso
      po.plus_expires_at = newExp
      delete po.plus_reminder_sent_for; delete po.plus_renew_notified_for
      await supabase.from('customers').update({ pricing_overrides: po }).eq('id', c.id)
      await supabase.from('plus_payments').insert({
        customer_id: c.id, customer_email: c.email, amount_cents: priceCents,
        square_payment_id: payId, kind: 'renewal', period_start: startIso, period_end: newExp,
      })
      if (c.email) await sendSimpleEmail({
        to: c.email, subject: 'Your Made Kulture Plus renewed', heading: 'Membership renewed',
        paragraphs: [`Your Plus membership renewed for <strong style="color:#fff;">$${dollars}</strong>. Next renewal: <strong style="color:#fff;">${fmtDate(newExp)}</strong>.`],
        ctaText: 'See availability', ctaUrl: `${APP_URL}/availability`, label: 'plus_renew_receipt',
      }).catch(() => {})
      renewed++
    } catch (e: any) {
      await notifyFailOnce('Your renewal didn’t go through', 'We tried to renew your Plus membership but the charge didn’t go through. Re-subscribe anytime to restore your benefits.')
      if (c.phone) await sendSMS(c.phone, `Made Kulture: your Plus renewal didn’t go through. Re-subscribe: ${APP_URL}/account/plus`).catch(() => {})
      await sendOwnerSMS(`Plus renewal failed for ${c.name || c.email || 'a member'} — charge declined.`).catch(() => {})
      failed++
    }
  }

  return NextResponse.json({ ok: true, reminders, renewed, failed })
}
