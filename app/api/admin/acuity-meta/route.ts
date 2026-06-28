import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/acuity-meta?password=XXX
// Read-only diagnostic: dumps Acuity calendars + appointment types so we can
// build a correct set → appointment-type mapping for the two-way sync.
export async function GET(req: NextRequest) {
  const password = new URL(req.url).searchParams.get('password')
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.ACUITY_USER_ID
  const apiKey = process.env.ACUITY_API_KEY
  if (!userId || !apiKey) {
    return NextResponse.json({ error: 'Missing Acuity credentials' }, { status: 500 })
  }
  const auth = 'Basic ' + Buffer.from(`${userId}:${apiKey}`).toString('base64')

  try {
    const [calRes, typeRes] = await Promise.all([
      fetch('https://acuityscheduling.com/api/v1/calendars', { headers: { Authorization: auth } }),
      fetch('https://acuityscheduling.com/api/v1/appointment-types', { headers: { Authorization: auth } }),
    ])
    const calendars = calRes.ok ? await calRes.json() : { error: calRes.status }
    const typesRaw  = typeRes.ok ? await typeRes.json() : []

    // Trim appointment types to the fields that matter for mapping
    const appointmentTypes = Array.isArray(typesRaw)
      ? typesRaw.map((t: any) => ({
          id: t.id, name: t.name, active: t.active,
          duration: t.duration, price: t.price,
          calendarIDs: t.calendarIDs, category: t.category, private: t.private,
        }))
      : typesRaw

    const calendarsTrim = Array.isArray(calendars)
      ? calendars.map((c: any) => ({ id: c.id, name: c.name, timezone: c.timezone }))
      : calendars

    return NextResponse.json({
      calendars: calendarsTrim,
      appointmentTypeCount: Array.isArray(appointmentTypes) ? appointmentTypes.length : 0,
      appointmentTypes,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Acuity request failed' }, { status: 500 })
  }
}
