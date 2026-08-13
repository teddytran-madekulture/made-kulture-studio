// POST /api/bookings/delegate — "someone else pays" hold.
// Validates + prices the order (shared with checkout), creates the booking row(s)
// as status='pending_payment' to hold the slot, then sends a short-lived pay link
// to the payer. NO card, NO charge here — the payer pays on /pay/[token].

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { validateAndPriceOrder, insertBookingRows, fmt12, type BookingCoreInput } from '@/lib/booking-core'
import { sessionMayBookShortNotice } from '@/lib/short-notice'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendSMS, toE164 } from '@/lib/sms'
import { sendSimpleEmail } from '@/lib/email'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

interface DelegateRequest extends BookingCoreInput {
  payerName?: string
  payerContact: string          // phone or email
  payerChannel?: 'sms' | 'email' // inferred if omitted
}

function inferChannel(contact: string): 'sms' | 'email' {
  return contact.includes('@') ? 'email' : 'sms'
}

// DELETE /api/bookings/delegate — cancel a hold (used by "pay it myself instead"
// so the booker can pay with a card without their own pending hold blocking the slot).
export async function DELETE(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 })
    const { data: d } = await supabase
      .from('payment_delegations')
      .select('id, booking_ids, status')
      .eq('pay_token', token).maybeSingle()
    if (!d) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    if (d.status === 'pending') {
      await supabase.from('payment_delegations').update({ status: 'cancelled' }).eq('id', d.id)
      await supabase.from('bookings').update({ status: 'cancelled' })
        .in('id', d.booking_ids).eq('status', 'pending_payment')
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Could not cancel.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: DelegateRequest = await req.json()

    if (!body.payerContact || !body.payerContact.trim()) {
      return NextResponse.json({ error: 'Enter who should pay (their phone or email).' }, { status: 400 })
    }
    const channel = body.payerChannel || inferChannel(body.payerContact)

    // Validate the payer's number NOW, not at send time. The old normalizePhone
    // turned anything into `+<digits>` and stored it, so a typo'd number meant
    // the pay link silently went nowhere, the hold quietly expired, and the slot
    // reopened — with the booker believing their friend had been texted.
    const payerPhone = channel === 'sms' ? toE164(body.payerContact) : null
    if (channel === 'sms' && !payerPhone) {
      return NextResponse.json({ error: 'That phone number doesn\'t look right — check it and try again.' }, { status: 400 })
    }

    // 1. Validate + price (shared with checkout). Booker's login = member rate.
    let isMember = false
    let sessionEmail: string | null = null
    try {
      const { data } = await createServerClient().auth.getUser()
      isMember = !!data.user
      sessionEmail = data.user?.email ?? null
    } catch { /* guest */ }
    // Short-notice eligibility comes from the VERIFIED session, never body.email.
    const allowShortNotice = await sessionMayBookShortNotice(supabase, sessionEmail)
    const v = await validateAndPriceOrder(supabase, body, { isMember, allowShortNotice })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status })
    const { lines, verifiedCents } = v.order

    if (verifiedCents <= 0) {
      return NextResponse.json({ error: 'This order is $0 — just book it directly, no payment link needed.' }, { status: 400 })
    }

    // 2. Settings: hold length + per-booker active-hold cap.
    const { data: settingRows } = await supabase
      .from('studio_settings').select('key, value')
      .in('key', ['delegated_hold_minutes', 'delegated_max_active_per_contact'])
    const settingMap: Record<string, string> = {}
    for (const s of settingRows ?? []) settingMap[s.key] = s.value
    const holdMinutes = Number(settingMap['delegated_hold_minutes']) || 30
    const maxActive   = Number(settingMap['delegated_max_active_per_contact']) || 2

    // Anti slot-blocking: cap live holds per booker email.
    if (body.email) {
      const { count } = await supabase
        .from('payment_delegations')
        .select('id', { count: 'exact', head: true })
        .eq('booker_email', body.email.toLowerCase().trim())
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
      if ((count ?? 0) >= maxActive) {
        return NextResponse.json(
          { error: `You already have ${maxActive} pending payment link${maxActive === 1 ? '' : 's'} out. Let one complete or expire before starting another.` },
          { status: 429 }
        )
      }
    }

    // 3. Upsert customer + link auth user (so confirmations resolve later).
    const { data: customerData } = await supabase
      .from('customers')
      .upsert({ email: body.email, name: body.name, phone: body.phone }, { onConflict: 'email' })
      .select('id').single()
    const supabaseCustomerId = customerData?.id ?? null

    let authUserId: string | null = null
    try {
      const { data: authUsers } = await supabase.auth.admin.listUsers()
      authUserId = authUsers?.users?.find((u: any) => u.email === body.email)?.id ?? null
    } catch { /* non-fatal */ }

    // 4. Insert the held booking row(s) — status pending_payment holds the slot.
    //    Shared with the short-notice auto-pay path via lib/booking-core so
    //    there is one writer, not one per payment flow.
    const ins = await insertBookingRows(supabase, v.order, {
      status:     'pending_payment',
      source:     'website-delegated',
      customerId: supabaseCustomerId,
      authUserId,
      notes:      body.notes,
      equipment:  body.equipment,
    })
    if (!ins.ok) return NextResponse.json({ error: ins.error }, { status: 500 })
    const { bookingIds, orderGroup } = ins

    // 5. Create the delegation + token.
    const payToken = randomUUID()
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString()
    const payerContact = payerPhone ?? body.payerContact.trim()

    const { error: delErr } = await supabase.from('payment_delegations').insert({
      order_group:   orderGroup,
      booking_ids:   bookingIds,
      payer_name:    body.payerName || null,
      payer_contact: payerContact,
      channel,
      amount_cents:  verifiedCents,
      status:        'pending',
      pay_token:     payToken,
      booker_name:   body.name,
      booker_email:  body.email ? body.email.toLowerCase().trim() : null,
      booker_phone:  body.phone || null,
      expires_at:    expiresAt,
    })
    if (delErr) {
      console.error('[delegate] delegation insert error:', delErr)
      await supabase.from('bookings').delete().in('id', bookingIds)
      return NextResponse.json({ error: 'Could not create the payment link — please try again.' }, { status: 500 })
    }

    // 6. Send the pay link to the payer.
    const payUrl = `${APP_URL}/pay/${payToken}`
    const dollars = (verifiedCents / 100).toFixed(2)
    const sched = lines.map(l => `${l.setName} — ${l.date} ${fmt12(l.startHour)}–${fmt12(l.endHour)}`).join('; ')
    const whoFrom = body.name ? `${body.name} ` : ''
    try {
      if (channel === 'sms') {
        await sendSMS(
          payerContact,
          `Made Kulture — ${whoFrom}asked you to cover a studio booking.\n${sched}\n$${dollars}\n\nPay within ${holdMinutes} min to lock it in: ${payUrl}\nReply STOP to opt out.`
        )
      } else {
        await sendSimpleEmail({
          to: payerContact,
          subject: `Complete a Made Kulture booking ($${dollars})`,
          heading: `${whoFrom}asked you to cover a studio booking`,
          paragraphs: [
            `<strong style="color:#fff;">${sched}</strong>`,
            `Amount: <strong style="color:#fff;">$${dollars}</strong>`,
            `This slot is held for <strong style="color:#fff;">${holdMinutes} minutes</strong>. Pay before the timer runs out to lock it in — otherwise it reopens.`,
          ],
          ctaText: 'Pay & confirm',
          ctaUrl: payUrl,
          label: 'delegated_pay_link',
        })
      }
    } catch (e) {
      console.error('[delegate] send pay link failed:', e)
      // The hold still exists; the booker can resend/pay-it-myself. Don't 500.
    }

    sendOwnerPush({
      title: '⏳ Payment link sent',
      body: `${body.name} sent a $${dollars} pay link to ${body.payerName || payerContact} — ${lines.map(l => l.setName).join(', ')}. Held ${holdMinutes} min.`,
      url: '/admin/dashboard',
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      token: payToken,
      payUrl,
      expiresAt,
      holdMinutes,
      payerContact,
      channel,
      amount: dollars,
    })
  } catch (err: any) {
    console.error('[delegate] error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
