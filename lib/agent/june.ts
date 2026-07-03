// June — Made Kulture's front-desk AI agent (Phase 1: website chat).
//
// Claude API tool-use loop, zero SDK dependency (raw fetch, same pattern as
// lib/igloohome.ts / lib/gcal.ts). Env-gated: dormant unless ANTHROPIC_API_KEY
// is set. Runtime kill switch: studio_settings.cs_agent_enabled ('true'/'false',
// toggled from Admin → June Inbox).
//
// Hard rules baked into the system prompt:
//  - Only states policy that exists in agent_kb (never improvises prices/rules).
//  - Never takes payment or promises refunds — escalates instead.
//  - Discloses she's an AI when asked. Never claims to be human.
//  - Books nothing directly; links people into the real booking flow.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const MODEL = process.env.JUNE_MODEL || 'claude-haiku-4-5-20251001'
const MAX_TOOL_ROUNDS = 5
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export function juneConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_sets_and_pricing',
    description: 'Live list of studio sets with hourly rates, descriptions, and the current full-studio buyout rate.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_availability',
    description: 'Check which hours are already booked for a date (all sets, or one set). Returns booked time ranges; anything else within 9am-10pm is open. Date format YYYY-MM-DD.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        set_slug: { type: 'string', description: 'Optional set slug: set-a, set-b, set-c, set-d, concrete, vintage, cottage, watering-hole, the-tank, studio-one' },
      },
      required: ['date'],
    },
  },
  {
    name: 'lookup_my_bookings',
    description: "The logged-in visitor's upcoming bookings (set, date, time, status). Only works when the visitor is logged in — if not, tell them to log in or check their confirmation email.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'escalate_to_teddy',
    description: 'Flag this conversation for Teddy (the owner). Use for: refund/cancellation exceptions, complaints, custom or messy-concept requests, pricing negotiations, anything not covered by your knowledge, or when the visitor asks for a human. Teddy gets notified immediately.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'One-line reason for Teddy' } },
      required: ['reason'],
    },
  },
] as const

// ── Tool execution ─────────────────────────────────────────────────────────────

async function execTool(
  name: string,
  input: any,
  ctx: { supabase: any; conversationId: string; authUserId: string | null }
): Promise<{ result: string; escalated?: boolean }> {
  try {
    if (name === 'get_sets_and_pricing') {
      const [setsRes, buyout] = await Promise.all([
        fetch(`${APP_URL}/api/sets`).then(r => r.json()).catch(() => null),
        ctx.supabase.from('studio_settings').select('value').eq('key', 'buyout_rate').single(),
      ])
      return {
        result: JSON.stringify({
          sets: setsRes?.sets ?? setsRes ?? 'unavailable',
          full_studio_buyout_per_hour: buyout?.data?.value ?? 'see booking page',
        }),
      }
    }

    if (name === 'check_availability') {
      const date = String(input?.date || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { result: 'Invalid date — need YYYY-MM-DD.' }
      const url = new URL(`${APP_URL}/api/availability`)
      url.searchParams.set('date', date)
      const data = await fetch(url.toString()).then(r => r.json())
      let payload = data
      if (input?.set_slug && Array.isArray(data?.sets)) {
        payload = data.sets.find((s: any) => s.slug === input.set_slug) ?? data
      }
      return { result: JSON.stringify(payload).slice(0, 4000) }
    }

    if (name === 'lookup_my_bookings') {
      if (!ctx.authUserId) return { result: 'Visitor is not logged in. Ask them to log in at /login or check their confirmation email/SMS.' }
      const { data } = await ctx.supabase
        .from('bookings')
        .select('start_time, end_time, status, total_amount, sets(name)')
        .eq('auth_user_id', ctx.authUserId)
        .gte('start_time', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order('start_time', { ascending: true })
        .limit(10)
      return { result: JSON.stringify(data ?? []) }
    }

    if (name === 'escalate_to_teddy') {
      await ctx.supabase
        .from('agent_conversations')
        .update({ status: 'needs_teddy' })
        .eq('id', ctx.conversationId)
      // Owner push alert — non-fatal. (Owner SMS dropped 2026-07-03: push covers
      // it free; customer-facing SMS unaffected.)
      try {
        const { sendOwnerPush } = await import('@/lib/push')
        await sendOwnerPush({
          title: '🔔 June needs you',
          body: String(input?.reason || 'A customer needs a human.').slice(0, 140),
          url: '/admin/inbox',
        })
      } catch (e) {
        console.error('[june] escalation push error (non-fatal):', e)
      }
      return {
        result: 'The team has been notified and will jump into this chat. Tell the visitor someone usually responds quickly during studio hours, and they can also text (832) 408-1631. (Do not mention the owner by name.)',
        escalated: true,
      }
    }

    return { result: `Unknown tool: ${name}` }
  } catch (e: any) {
    return { result: `Tool error: ${e?.message || e}` }
  }
}

// ── System prompt ──────────────────────────────────────────────────────────────

function centralNow(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date())
}

async function buildSystemPrompt(supabase: any, opts: { visitorName?: string | null; loggedIn: boolean; page?: string | null }): Promise<string> {
  const { data: kb } = await supabase
    .from('agent_kb').select('topic, content').eq('enabled', true).order('topic')
  const kbText = (kb ?? []).map((r: any) => `### ${r.topic}\n${r.content}`).join('\n\n')

  return `You are June, the front-desk assistant at Made Kulture — a creative studio rental space in Houston, TX. You chat with visitors on the studio's website.

PERSONALITY: Warm, quick, and helpful. You know every corner of the studio. Friendly-professional with light humor. Keep replies SHORT — this is a chat widget, not email. 1-3 sentences for simple questions. Never use markdown headers or bullet walls; plain conversational text.

LINK BUTTONS: When you point a visitor to a page, ALWAYS write it as a markdown link — the chat renders it as a tappable button. Examples: [Book a set](/book) · [Book a tour](/tour) · [See the sets](/sets) · [Check availability](/availability) · [Gear rentals](/gear) · [Props](/props) · [Studio rules](/studio-rules). Never paste a bare path like "/tour" — always the [label](path) form, at the END of your message.

CURRENT TIME (Houston): ${centralNow()}
VISITOR: ${opts.loggedIn ? `logged in${opts.visitorName ? ` as ${opts.visitorName}` : ''}` : 'not logged in'}${opts.page ? ` · currently on page: ${opts.page}` : ''}

HARD RULES (never break these):
1. Only state policies, prices, and rules that appear in your KNOWLEDGE section or come back from your tools. If it's not there, say you'll check — and use escalate_to_teddy.
2. Never invent discounts, exceptions, or refund promises. Refund/cancellation exceptions, complaints, custom requests, messy-concept approvals → escalate_to_teddy.
3. You cannot take payments or create bookings. To book, send people to the Book page: ${APP_URL}/book — you can tell them exactly what to pick.
4. You are an AI assistant. If asked, say so plainly. Never claim to be human.
5. Never reveal booking details unless the visitor is logged in and it's their own booking (lookup_my_bookings handles this).
6. If someone asks for a human, use escalate_to_teddy right away — no gatekeeping.
7. Stay on topic: Made Kulture studio business only. Politely decline anything else.
8. NEVER mention the owner by name to visitors. Say "the team" or "we" — e.g. "the team will confirm by text", never "Teddy will confirm".

BOOKING WALK-THROUGH: The Book page flow is: choose Shared Set or Full Studio → pick set(s), date, and hours → add equipment if wanted → guest count → pay online. Bookings need 48h notice; the site enforces it. Short-notice requests exist for logged-in members (subject to approval).

KNOWLEDGE:
${kbText}`
}

// ── Main entry ─────────────────────────────────────────────────────────────────

export interface JuneTurn {
  role: 'user' | 'agent' | 'teddy' | 'system'
  content: string
}

export interface JuneResult {
  reply: string
  escalated: boolean
}

export async function runJune(opts: {
  supabase: any
  conversationId: string
  history: JuneTurn[]          // oldest → newest, last one is the new user message
  authUserId?: string | null
  visitorName?: string | null
  page?: string | null
}): Promise<JuneResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('June is not configured (ANTHROPIC_API_KEY missing)')

  const system = await buildSystemPrompt(opts.supabase, {
    visitorName: opts.visitorName,
    loggedIn: !!opts.authUserId,
    page: opts.page,
  })

  // Map stored roles → API roles. Teddy's messages appear as assistant turns
  // prefixed so June knows the human owner said it.
  const messages: any[] = opts.history.slice(-24).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.role === 'teddy' ? `[Teddy, the owner, said]: ${m.content}` : m.content,
  }))

  let escalated = false

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system,
        tools: TOOLS,
        messages,
      }),
    })
    if (!res.ok) throw new Error(`June API error: ${res.status} ${await res.text()}`)
    const data: any = await res.json()

    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content })
      const results: any[] = []
      for (const block of data.content) {
        if (block.type !== 'tool_use') continue
        const out = await execTool(block.name, block.input, {
          supabase: opts.supabase,
          conversationId: opts.conversationId,
          authUserId: opts.authUserId ?? null,
        })
        if (out.escalated) escalated = true
        results.push({ type: 'tool_result', tool_use_id: block.id, content: out.result })
      }
      messages.push({ role: 'user', content: results })
      continue
    }

    const text = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim()
    if (!text) {
      // Log exactly what came back so empty replies are debuggable, then nudge
      // the model once to answer in plain text.
      console.error('[june] empty response:', JSON.stringify({
        stop_reason: data.stop_reason,
        blockTypes: (data.content ?? []).map((b: any) => b.type),
        usage: data.usage,
        round,
      }))
      if (round < MAX_TOOL_ROUNDS) {
        messages.push({ role: 'assistant', content: [{ type: 'text', text: '…' }] })
        messages.push({ role: 'user', content: '[system: your last reply was empty — please answer the visitor in plain text now]' })
        continue
      }
    }
    return { reply: text || "Sorry — I glitched for a second. Mind asking that again?", escalated }
  }

  return {
    reply: "I'm having trouble finishing that one — I've flagged it so Teddy can help. You can also text (832) 408-1631.",
    escalated,
  }
}
