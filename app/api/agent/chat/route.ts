// June chat API — public endpoint behind the website chat widget.
//
// POST { token?, message, page? }  → { token, reply?, queued?, offline? }
//   Creates/continues a conversation. If Teddy has taken over, the message is
//   queued for him instead of answered by June.
// GET  ?token=...&after=ISO        → { messages, status, human_takeover }
//   Polling for async replies (Teddy takeover) + full history restore.
//
// Rate limits (in-memory, per serverless instance — good enough for v1):
//   20 messages / 5 min per IP, 1000-char message cap.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { runJune, juneConfigured, JuneTurn } from '@/lib/agent/june'

const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OFFLINE_MSG = "Chat's offline right now — text us at (832) 408-1631 and we'll get you sorted!"

// ── Rate limiting ──────────────────────────────────────────────────────────────
const WINDOW_MS = 5 * 60 * 1000
const MAX_PER_WINDOW = 20
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter(t => now - t < WINDOW_MS)
  if (arr.length >= MAX_PER_WINDOW) { hits.set(ip, arr); return true }
  arr.push(now)
  hits.set(ip, arr)
  if (hits.size > 5000) hits.clear() // crude memory guard
  return false
}

async function agentEnabled(): Promise<boolean> {
  if (!juneConfigured()) return false
  const { data } = await supabase
    .from('studio_settings').select('value').eq('key', 'cs_agent_enabled').single()
  return data?.value === 'true'
}

// ── POST — send a message ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Slow down a little — try again in a few minutes.' }, { status: 429 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const message = String(body?.message ?? '').trim().slice(0, 1000)
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  const isKiosk = body?.kiosk === true
  const page = isKiosk ? 'kiosk' : typeof body?.page === 'string' ? body.page.slice(0, 200) : null

  // Who's talking? (logged-in members get booking lookup)
  let authUserId: string | null = null
  let visitorName: string | null = null
  let visitorEmail: string | null = null
  try {
    const userClient = createUserClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (user) {
      authUserId = user.id
      visitorEmail = user.email ?? null
      visitorName = (user.user_metadata?.full_name as string) ?? null
    }
  } catch {}

  // Find or create the conversation.
  let convo: any = null
  const token = typeof body?.token === 'string' && body.token.length >= 16 ? body.token : null
  if (token) {
    const { data } = await supabase.from('agent_conversations').select('*').eq('token', token).single()
    convo = data
  }
  if (!convo) {
    const newToken = randomUUID() + randomUUID().slice(0, 8)
    const { data, error } = await supabase
      .from('agent_conversations')
      .insert({ token: newToken, channel: isKiosk ? 'kiosk' : 'web', auth_user_id: authUserId, visitor_name: visitorName, visitor_email: visitorEmail, page })
      .select('*').single()
    if (error || !data) return NextResponse.json({ error: 'Could not start chat' }, { status: 500 })
    convo = data
  } else if (authUserId && !convo.auth_user_id) {
    await supabase.from('agent_conversations')
      .update({ auth_user_id: authUserId, visitor_name: visitorName, visitor_email: visitorEmail })
      .eq('id', convo.id)
    convo.auth_user_id = authUserId
  }

  if (convo.status === 'closed') {
    await supabase.from('agent_conversations').update({ status: 'open' }).eq('id', convo.id)
  }

  // Store the user message.
  await supabase.from('agent_messages').insert({ conversation_id: convo.id, role: 'user', content: message })
  await supabase.from('agent_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convo.id)

  // Teddy has the wheel → queue only.
  if (convo.human_takeover) {
    return NextResponse.json({ token: convo.token, queued: true })
  }

  // Kill switch / not configured → canned offline reply (stored so Teddy sees the miss).
  if (!(await agentEnabled())) {
    await supabase.from('agent_messages').insert({ conversation_id: convo.id, role: 'system', content: OFFLINE_MSG })
    return NextResponse.json({ token: convo.token, offline: true, reply: OFFLINE_MSG })
  }

  // Load recent history (includes the message we just stored).
  // History for the model: skip 'system' rows (offline/fallback notices — UI
  // artifacts that only confuse her) and send the most recent turns.
  const { data: historyRows } = await supabase
    .from('agent_messages')
    .select('role, content, created_at')
    .eq('conversation_id', convo.id)
    .neq('role', 'system')
    .order('created_at', { ascending: false })
    .limit(20)
    .then((r: any) => ({ ...r, data: (r.data ?? []).reverse() }))

  try {
    const result = await runJune({
      supabase,
      conversationId: convo.id,
      history: (historyRows ?? []) as JuneTurn[],
      authUserId: convo.auth_user_id ?? authUserId,
      visitorName: convo.visitor_name ?? visitorName,
      page,
    })
    await supabase.from('agent_messages').insert({ conversation_id: convo.id, role: 'agent', content: result.reply })
    await supabase.from('agent_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convo.id)
    return NextResponse.json({ token: convo.token, reply: result.reply, escalated: result.escalated })
  } catch (e) {
    console.error('[agent/chat] June error:', e)
    const fallback = "Something hiccuped on my end — mind trying again? If it keeps happening, text (832) 408-1631."
    await supabase.from('agent_messages').insert({ conversation_id: convo.id, role: 'system', content: fallback })
    return NextResponse.json({ token: convo.token, reply: fallback })
  }
}

// ── GET — poll / restore ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token.length < 16) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: convo } = await supabase
    .from('agent_conversations')
    .select('id, status, human_takeover')
    .eq('token', token).single()
  if (!convo) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const after = req.nextUrl.searchParams.get('after')
  let q = supabase
    .from('agent_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: true })
    .limit(100)
  if (after) q = q.gt('created_at', after)
  const { data: messages } = await q

  return NextResponse.json({
    messages: messages ?? [],
    status: convo.status,
    human_takeover: convo.human_takeover,
  })
}
