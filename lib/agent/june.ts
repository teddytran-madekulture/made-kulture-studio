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
    name: 'get_studio_conditions',
    description: "The studio's current live conditions from the Nest thermostat: indoor temperature, humidity, and the outdoor temperature (all in °F). Use whenever a visitor asks how hot or cold it is, the current temperature or humidity, or what the climate is like in the studio right now.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_props',
    description: "The studio's live catalog of props (included free, first-come-first-serve during shared hours). Call with NO query to list what's available grouped by category. Call WITH a query (e.g. 'velvet couch', 'weight bench') to find specific props and get a shareable photo link for each match.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional keyword to find specific props (matches name, description, tags). Omit to list everything by category.' },
      },
      required: [],
    },
  },
  {
    name: 'request_extension',
    description: 'KIOSK ONLY: start a session extension (+1 or +2 hours) for the booking happening right now. This NEVER charges anyone directly — it texts a secure confirm-and-pay link to the phone number on the booking, and only that phone can approve the charge. Use when a checked-in guest asks for more time. If the guest is not the checked-in one, ask for the phone number on the booking and pass it as phone.',
    input_schema: {
      type: 'object',
      properties: {
        hours: { type: 'integer', description: '1 or 2' },
        phone: { type: 'string', description: 'Phone number on the booking — only needed if there is no checked-in guest context' },
      },
      required: ['hours'],
    },
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
  ctx: { supabase: any; conversationId: string; authUserId: string | null; kiosk?: boolean; kioskBookingId?: string | null }
): Promise<{ result: string; escalated?: boolean }> {
  try {
    if (name === 'request_extension') {
      if (!ctx.kiosk) return { result: 'Extensions can only be started from the in-studio kiosk. Tell the visitor to use the front-desk tablet at the studio, or text (832) 408-1631.' }
      const hours = Number(input?.hours)
      if (hours !== 1 && hours !== 2) return { result: 'Only 1 or 2 extra hours can be added this way.' }

      const { planExtension, findActiveBookingByPhone } = await import('@/lib/extensions')
      let bookingId: string | null = ctx.kioskBookingId ?? null
      if (!bookingId && input?.phone) bookingId = await findActiveBookingByPhone(String(input.phone))
      if (!bookingId) return { result: 'No booking identified. Ask the guest for the phone number on the booking, then call this tool again with it.' }

      const p = await planExtension(bookingId, hours)
      if ('error' in p) return { result: p.error }
      if (p.conflict) return { result: `The set is booked right after this session — the extra ${hours} hour(s) are not available. Suggest they text (832) 408-1631 to see other options.` }
      if (!p.hasCardOnFile) return { result: 'There is no card on file for this booking, so it cannot be self-paid. Tell them to tap GET THE TEAM or text (832) 408-1631 to arrange it.' }
      if (!p.customerPhone) return { result: 'No phone number on this booking — tell them to text (832) 408-1631.' }

      // One live request per booking: reuse a pending unexpired one, else create.
      const { randomUUID } = await import('crypto')
      const nowISO = new Date().toISOString()
      const { data: existing } = await ctx.supabase
        .from('extension_requests')
        .select('id, confirm_token, hours')
        .eq('booking_id', bookingId).eq('status', 'pending')
        .gt('expires_at', nowISO)
        .maybeSingle()

      let token: string
      if (existing && existing.hours === hours) {
        token = existing.confirm_token
      } else {
        if (existing) {
          await ctx.supabase.from('extension_requests').update({ status: 'cancelled' }).eq('id', existing.id)
        }
        token = randomUUID().replace(/-/g, '') + randomUUID().slice(0, 8)
        const { error } = await ctx.supabase.from('extension_requests').insert({
          booking_id: bookingId,
          hours,
          amount_cents: p.priceCents,
          confirm_token: token,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
        if (error) return { result: 'Could not create the extension request — tell them to text (832) 408-1631.' }
      }

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
      try {
        const { sendSMS } = await import('@/lib/sms')
        await sendSMS(
          p.customerPhone,
          `Made Kulture: add ${hours} hour${hours > 1 ? 's' : ''} on ${p.setName} for $${(p.priceCents / 100).toFixed(2)}?\nConfirm & pay (card on file): ${appUrl}/extend/${token}\nLink expires in 15 min. Didn't ask for this? Just ignore it.`
        )
      } catch (e) {
        console.error('[june] extension SMS error:', e)
        return { result: 'Could not send the confirmation text — tell them to text (832) 408-1631.' }
      }

      const last4 = p.customerPhone.replace(/\D/g, '').slice(-4)
      return {
        result: `Confirmation text sent to the phone on the booking (ending ${last4}). It is $${(p.priceCents / 100).toFixed(2)} for ${hours} extra hour(s) on ${p.setName}, charged to the card on file ONLY if they tap confirm on their own phone within 15 minutes. Tell the guest to check that phone.`,
      }
    }

    if (name === 'get_sets_and_pricing') {
      const setsRes = await fetch(`${APP_URL}/api/sets`).then(r => r.json()).catch(() => null)
      const surcharge = setsRes?.guestSurchargePerHour ?? 10
      return {
        result: JSON.stringify({
          sets: setsRes?.sets ?? 'unavailable',
          full_studio_buyout_per_hour: setsRes?.buyoutRate ?? 'see booking page',
          member_vs_guest: `rate_per_hour on each set is the MEMBER price (free account). Guests who aren't signed in pay $${surcharge}/hr MORE per set — e.g. a $40 set is $40 for members, $${40 + surcharge} for guests. Anyone can get the member rate by making a free account. Always mention the free-account member rate when quoting a price. The studio buyout is a flat rate and is NOT surcharged.`,
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

    if (name === 'get_studio_conditions') {
      const d = await fetch(`${APP_URL}/api/studio-temp`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null)
      if (!d || (d.indoorTemp == null && d.outdoorTemp == null && d.humidity == null)) {
        return { result: "The live studio conditions feed is unavailable right now — tell the visitor you can't read the current temperature, and they can text (832) 408-1631." }
      }
      return {
        result: JSON.stringify({
          indoor_temp_f: d.indoorTemp ?? null,
          humidity_percent: d.humidity ?? null,
          outdoor_temp_f: d.outdoorTemp ?? null,
          note: 'Live from the studio thermostat. State the indoor temperature naturally; only mention humidity/outdoor if relevant.',
        }),
      }
    }

    if (name === 'get_props') {
      const d = await fetch(`${APP_URL}/api/props`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null)
      if (!d || !Array.isArray(d.props)) {
        return { result: "The props catalog is unavailable right now — tell the visitor props are included free (first-come-first-serve during shared hours) and they can browse them with photos at /props." }
      }
      const absUrl = (u: string | null | undefined): string | null =>
        !u ? null : (u.startsWith('http') ? u : `${APP_URL}${u.startsWith('/') ? '' : '/'}${u}`)
      const q = String(input?.query || '').trim().toLowerCase()

      if (q) {
        const matches = d.props
          .filter((p: any) => [p.name, p.description, p.category, ...(p.tags || [])].join(' ').toLowerCase().includes(q))
          .slice(0, 8)
          .map((p: any) => ({ name: p.name, category: p.category, photo: absUrl(p.image_url), description: p.description || undefined }))
        return {
          result: JSON.stringify({
            query: q,
            count: matches.length,
            matches,
            note: matches.length
              ? "Share a prop's photo as a tappable markdown link like [see the <name>](photo). If photo is null, say a picture isn't on file. Props are first-come-first-serve — don't promise a specific one is free at their booking time."
              : "No props matched. Suggest they browse the full directory at /props or describe it another way.",
          }),
        }
      }

      const byCategory: Record<string, string[]> = {}
      for (const p of d.props) {
        const cat = p.category || 'Other'
        ;(byCategory[cat] ||= []).push(p.name)
      }
      return {
        result: JSON.stringify({
          total: d.props.length,
          by_category: byCategory,
          note: "Props are included free with any booking, first-come-first-serve during shared hours, and must be returned to their spots. This is the live list; the full browsable directory with photos is at /props. To share a specific prop's photo, call get_props again with a query for it. Don't promise a specific prop will be free at their booking time.",
        }),
      }
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

// Returns the system prompt in two parts:
//  - staticPart:  identical across every request (instructions + KB) → CACHEABLE.
//  - dynamicPart: changes per request (time, visitor, page) → not cached.
// Keeping the volatile bits (esp. the current time) OUT of the cached block is
// what lets prompt caching actually hit — otherwise the timestamp busts it every call.
async function buildSystemPrompt(supabase: any, opts: { visitorName?: string | null; loggedIn: boolean; page?: string | null }): Promise<{ staticPart: string; dynamicPart: string }> {
  const { data: kb } = await supabase
    .from('agent_kb').select('topic, content').eq('enabled', true).order('topic')
  const kbText = (kb ?? []).map((r: any) => `### ${r.topic}\n${r.content}`).join('\n\n')

  const staticPart = `You are June, the front-desk assistant at Made Kulture — a creative studio rental space in Houston, TX. You chat with visitors on the studio's website.

PERSONALITY: Warm, quick, and helpful. You know every corner of the studio. Friendly-professional with light humor. Keep replies SHORT — this is a chat widget, not email. 1-3 sentences for simple questions. Never use markdown headers or bullet walls; plain conversational text.

LINK BUTTONS: When you point a visitor to a page, ALWAYS write it as a markdown link — the chat renders it as a tappable button. Examples: [Book a set](/book) · [Book a tour](/tour) · [See the sets](/sets) · [Check availability](/availability) · [Gear rentals](/gear) · [Props](/props) · [Studio rules](/studio-rules). Never paste a bare path like "/tour" — always the [label](path) form, at the END of your message.

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

PRICING (member vs guest): Set rates are MEMBER prices. Guests who aren't signed in pay a per-hour surcharge per set, so ALWAYS mention that making a free account gets the lower member rate. Use get_sets_and_pricing for the live numbers and the exact surcharge — don't quote prices from memory. The full-studio buyout is a flat rate and is not surcharged. Booking is BY APPOINTMENT ONLY — online in advance, no walk-ins.

KNOWLEDGE:
${kbText}`

  const dynamicPart = `CURRENT TIME (Houston): ${centralNow()}
VISITOR: ${opts.loggedIn ? `logged in${opts.visitorName ? ` as ${opts.visitorName}` : ''}` : 'not logged in'}${opts.page ? ` · currently on page: ${opts.page}` : ''}
${opts.page === 'kiosk' ? `
KIOSK MODE: This visitor is PHYSICALLY AT THE STUDIO right now, talking to you on the wall tablet. Adjust accordingly: give in-person directions (where things are in the building) when your knowledge covers it, remind them to check in on this tablet if they're here for a booking, and for anything hands-on (unlock something, equipment help, spills, emergencies) use escalate_to_teddy or tell them to tap "GET THE TEAM" on this screen. Don't send them to website links for things they can do at the tablet.
EXTENSIONS AT THE KIOSK: If a guest wants extra time on their CURRENT session, use request_extension (1-2 hours). It never charges from this tablet — a confirm-and-pay text goes to the phone number on the booking, and only that phone can approve. If there's no checked-in guest context, ask for the booking's phone number first. Never promise the extension is done until they confirm on their phone. When the tool returns a refusal (no active booking, set booked next, no saved card), RELAY THAT EXACT REASON plainly — never call it a system error or hiccup.` : ''}`

  return { staticPart, dynamicPart }
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
  kioskBookingId?: string | null   // set when a kiosk guest checked in this session
}): Promise<JuneResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('June is not configured (ANTHROPIC_API_KEY missing)')

  const { staticPart, dynamicPart } = await buildSystemPrompt(opts.supabase, {
    visitorName: opts.visitorName,
    loggedIn: !!opts.authUserId,
    page: opts.page,
  })
  // Cache the static instructions + KB (identical across every request and every
  // tool round) so they're billed at ~10% on repeats. The volatile bits (time,
  // visitor, page) sit in an un-cached block after the breakpoint.
  const system = [
    { type: 'text', text: staticPart, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicPart },
  ]

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
          kiosk: opts.page?.startsWith('kiosk') ?? false,
          kioskBookingId: opts.kioskBookingId ?? null,
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
