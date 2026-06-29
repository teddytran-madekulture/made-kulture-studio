import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

// Shared Square client (same env detection the rest of the app uses).
const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

// BigInt money amounts → JSON-safe. Square SDK returns BigInt for amounts.
function jsonSafe<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))
}

// ── Device pairing (one-time setup) ────────────────────────────────────────────

// Create a device code the owner enters on the Square Register to pair it.
export async function createDeviceCode(name: string) {
  const res = await square.devicesApi.createDeviceCode({
    idempotencyKey: randomUUID(),
    deviceCode: { name, productType: 'TERMINAL_API' },
  })
  const dc = res.result.deviceCode
  return { id: dc?.id, code: dc?.code, status: dc?.status, deviceId: dc?.deviceId ?? null }
}

// Poll a device code; once PAIRED it carries the deviceId we charge against.
export async function getDeviceCode(id: string) {
  const res = await square.devicesApi.getDeviceCode(id)
  const dc = res.result.deviceCode
  return { id: dc?.id, code: dc?.code, status: dc?.status, deviceId: dc?.deviceId ?? null }
}

// Save a paired device as the active desk Register (deactivates any previous).
export async function saveActiveDevice(label: string, deviceId: string) {
  const db = supabaseAdmin()
  await db.from('square_devices').update({ is_active: false }).eq('is_active', true)
  const { data } = await db
    .from('square_devices')
    .insert({ label, device_id: deviceId, is_active: true })
    .select('id, label, device_id')
    .single()
  return data
}

export async function getActiveDevice() {
  const { data } = await supabaseAdmin()
    .from('square_devices')
    .select('id, label, device_id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .maybeSingle()
  return data
}

// ── Terminal checkout (push a charge to the paired Register) ────────────────────

export async function createTerminalCheckout(opts: {
  amountCents: number; deviceId: string; referenceId?: string; note?: string
}) {
  const res = await square.terminalApi.createTerminalCheckout({
    idempotencyKey: randomUUID(),
    checkout: {
      amountMoney: { amount: BigInt(Math.round(opts.amountCents)), currency: 'USD' },
      deviceOptions: { deviceId: opts.deviceId },
      referenceId: opts.referenceId,
      note: opts.note,
    },
  })
  return jsonSafe(res.result.checkout)
}

export async function getTerminalCheckout(checkoutId: string) {
  const res = await square.terminalApi.getTerminalCheckout(checkoutId)
  return jsonSafe(res.result.checkout)
}

export async function cancelTerminalCheckout(checkoutId: string) {
  const res = await square.terminalApi.cancelTerminalCheckout(checkoutId)
  return jsonSafe(res.result.checkout)
}
