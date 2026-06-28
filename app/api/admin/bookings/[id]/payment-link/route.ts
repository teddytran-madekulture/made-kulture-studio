import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import twilio from 'twilio'
import { randomUUID } from 'crypto'

const square = new Client({
  accessToken:  process.env.SQUARE_ACCESS_TOKEN!,
  environment:  process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)


function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return `+${d}`
}

// POST /api/admin/bookings/[id]/payment-link
// Creates a Square payment link for the booking difference and optionally SMS it
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount, description, phone, customerName, sendSms } = await req.json()

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  }

  try {
    const { result } = await square.checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      quickPay: {
        name:       description || 'Made Kulture — Booking Adjustment',
        priceMoney: { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
        locationId: process.env.SQUARE_LOCATION_ID!,
      },
    })

    const url = result.paymentLink?.url
    if (!url) throw new Error('Square did not return a payment link URL')

    let smsError: string | null = null
    if (sendSms && phone) {
      const msg = [
        `Hi ${customerName}! Your Made Kulture booking has been updated.`,
        ``,
        `Please pay the balance of $${Number(amount).toFixed(2)}:`,
        url,
        ``,
        `Questions? Text (832) 408-1631`,
      ].join('\n')

      try {
        await twilioClient.messages.create({
          body: msg,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   normalizePhone(phone),
        })
      } catch (e: any) {
        console.error('SMS error:', e)
        smsError = e?.message || 'SMS failed to send'
      }
    }

    return NextResponse.json({ success: true, url, smsError })
  } catch (err: any) {
    console.error('Payment link error:', err)
    c