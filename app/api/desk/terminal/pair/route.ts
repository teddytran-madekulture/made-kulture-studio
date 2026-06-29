import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/staff-auth'
import { createDeviceCode, getDeviceCode, saveActiveDevice } from '@/lib/square-terminal'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

function squareErr(e: any): string {
  const detail = e?.errors?.[0]?.detail || e?.result?.errors?.[0]?.detail
  if (detail) return detail
  if (String(e?.message || '').toLowerCase().includes('scope'))
    return 'The Square access token is missing the DEVICE_CREDENTIAL_MANAGEMENT permission — regenerate it in the Square Developer dashboard with that scope.'
  return 'Square request failed. Check the access token and that the Register is online.'
}

// POST /api/desk/terminal/pair  { label? }  → create a device code (owner only).
export async function POST(req: NextRequest) {
  const g = requireStaff(req, 'settings.edit')
  if (g instanceof NextResponse) return g

  let body: { label?: string } = {}
  try { body = await req.json() } catch { /* label optional */ }
  const label = (body.label ?? 'Front Desk Register').trim() || 'Front Desk Register'

  try {
    const dc = await createDeviceCode(label)
    await audit(g, 'terminal.pair_started', { entityType: 'device', entityId: dc.id ?? undefined, details: { label } })
    return NextResponse.json({ id: dc.id, code: dc.code, status: dc.status, label })
  } catch (e) {
    console.error('[terminal pair] createDeviceCode failed', e)
    return NextResponse.json({ error: squareErr(e) }, { status: 502 })
  }
}

// GET /api/desk/terminal/pair?id=...&label=...  → poll pairing; save when PAIRED.
export async function GET(req: NextRequest) {
  const g = requireStaff(req, 'settings.edit')
  if (g instanceof NextResponse) return g

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const label = url.searchParams.get('label') ?? 'Front Desk Register'
  if (!id) return NextResponse.json({ error: 'Missing code id.' }, { status: 400 })

  try {
    const dc = await getDeviceCode(id)
    if (dc.status === 'PAIRED' && dc.deviceId) {
      const device = await saveActiveDevice(label, dc.deviceId)
      await audit(g, 'terminal.paired', { entityType: 'device', entityId: dc.deviceId, details: { label } })
      return NextResponse.json({ status: 'PAIRED', device })
    }
    return NextResponse.json({ status: dc.status ?? 'UNKNOWN' })
  } catch (e) {
    console.error('[terminal pair] getDeviceCode failed', e)
    return NextResponse.json({ error: squareErr(e) }, { status: 502 })
  }
}
