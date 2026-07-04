// When a booking that was paid by a THIRD PARTY (the "someone else pays" flow)
// is refunded, tell that payer their card was refunded — they aren't the
// booking's customer, so the normal cancellation email would never reach them.
// Safe to call for any booking: if there's no delegated payment, it no-ops.

import { supabaseAdmin } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'
import { sendSimpleEmail } from '@/lib/email'

export async function notifyDelegatedRefund(bookingId: string, amountCents: number): Promise<void> {
  try {
    const db = supabaseAdmin()
    const { data } = await db
      .from('payment_delegations')
      .select('payer_contact, channel, booker_name')
      .contains('booking_ids', [bookingId])
      .eq('status', 'paid')
      .maybeSingle()
    if (!data?.payer_contact) return

    const dollars = (amountCents / 100).toFixed(2)
    const forWhom = data.booker_name ? `${data.booker_name}'s` : 'the'

    if (data.channel === 'email') {
      await sendSimpleEmail({
        to: data.payer_contact,
        subject: `Refund issued — Made Kulture ($${dollars})`,
        heading: 'Refund issued',
        paragraphs: [
          `Your $${dollars} payment for ${forWhom} Made Kulture booking has been refunded to the card you used.`,
          `Refunds typically take a few business days to appear on your statement. Nothing else is needed from you.`,
        ],
        label: 'delegated_refund',
      })
    } else {
      await sendSMS(
        data.payer_contact,
        `Made Kulture: $${dollars} has been refunded to your card for ${forWhom} booking. Allow a few business days to post.\n— Made Kulture`
      )
    }
  } catch (e) {
    console.error('[refund-notify] failed (non-fatal):', e)
  }
}
