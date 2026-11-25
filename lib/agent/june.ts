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

import { looksLikePunt } from './question-review-core'
import { chiTodayStr, minAdvanceDateStr } from '@/lib/short-notice'
import { recordAiUsage } from '@/lib/ai-usage'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
// 2026-11-25: Sonnet 5.5, not Haiku — Haiku ignored her own rules (bullet walls,
// date math). New env name on purpose, so an old JUNE_MODEL=haiku in Vercel can't
// silently keep her on the weak model. JUNE_MODEL still drives polish + vision-test.
const CHAT_MODEL = process.env.JUNE_CHAT_MODEL || 'claude-sonnet-5-5'
// Email isn't live, so it gets the strongest model; a visitor watching the chat
// dots gets the faster one.
const EMAIL_MODEL = process.env.JUNE_EMAIL_MODEL || 'claude-opus-5-5'
const modelFor = (page?: string | null) => (page?.startsWith('email:') ? EMAIL_MODEL : CHAT_MODEL)
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
    description: 'The ONLY source of truth for a specific date. Returns date_info (the real weekday, whether the date can be booked online under the 48-hour rule, and any holiday or studio closure by name) plus the unavailable hours per set; anything else within 9am-10pm is open. Call it before saying anything about a date. Date format YYYY-MM-DD.',
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
    name: 'log_knowledge_gap',
    description: 'SILENT, internal. Call this whenever the visitor asks something your KNOWLEDGE section and tools do not answer (fully or partly) — so the team can teach you the answer later. The visitor never sees this. Call it at most once per question, then still reply to the visitor normally.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: "The visitor's question in one plain sentence, as they meant it (e.g. \"How many photos can I upload to my portfolio?\"). No names, emails or phone numbers." },
        kind: { type: 'string', enum: ['not_in_knowledge', 'partial'], description: 'not_in_knowledge = you had nothing; partial = you answered part of it but a key detail was missing' },
      },
      required: ['question'],
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
      // Scoped to kind='extend' so June never cancels an admin overtime request
      // sitting on the same booking — different money, different conversation.
      const { data: existing } = await ctx.supabase
        .from('extension_requests')
        .select('id, confirm_token, hours')
        .eq('booking_id', bookingId).eq('status', 'pending').eq('kind', 'extend')
        .gt('expires_at', nowISO)
        .maybeSingle()

      let token: string
      if (existing && Number(existing.hours) === hours) {
        token = existing.confirm_token
      } else {
        if (existing) {
          await ctx.supabase.from('extension_requests').update({ status: 'cancelled' }).eq('id', existing.id)
        }
        token = randomUUID().replace(/-/g, '') + randomUUID().slice(0, 8)
        const { error } = await ctx.supabase.from('extension_requests').insert({
          booking_id: bookingId,
          hours,
          kind: 'extend',
          created_by: 'june',
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
          pricing_note: `Each set's rate_per_hour is the base MEMBER price; a non-member pays $${surcharge}/hr MORE per set, so the guest rate is rate_per_hour + $${surcharge}/hr (e.g. a $40 set is $${40 + surcharge}/hr for guests). BY DEFAULT quote the GUEST rate as the price and invite people to sign up free for lower member rates — don't proactively break down "members $X vs guests $Y". BUT if someone directly asks what the member rate or member pricing is, answer honestly: the member rate is rate_per_hour (e.g. $40/hr), free with an account. The studio buyout is a flat rate and is NOT surcharged.`,
        }),
      }
    }

    if (name === 'check_availability') {
      const date = String(input?.date || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { result: 'Invalid date — need YYYY-MM-DD.' }
      const url = new URL(`${APP_URL}/api/availability`)
      url.searchParams.set('date', date)
      const data = await fetch(url.toString(), { cache: 'no-store' }).then(r => r.json())

      // 2026-11-25: June told two customers (Landre 11/17, Cassandra 11/24) that
      // Wed Nov 25 was Thanksgiving, and walked Cassandra through booking a date
      // inside the 48-hour window that the site then refused. She was doing the
      // date math herself. Now this tool hands her the answers: the real weekday,
      // whether the date is bookable online (same rule as checkout), and closures
      // by their PUBLIC label only. Owner time-off blocks have no public label and
      // are folded into "unavailable" with no reason, so a private note never leaks.
      const hr = (h: number) => {
        const H = Math.floor(h), m = Math.round((h - H) * 60)
        const ap = H >= 12 && H < 24 ? 'PM' : 'AM'
        const h12 = H % 12 === 0 ? 12 : H % 12
        return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${ap}`
      }
      const range = (r: any) => (r.start <= 0 && r.end >= 24) ? 'all day' : `${hr(r.start)}-${hr(r.end)}`
      const dayName = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`))

      const today = chiTodayStr()
      const minDate = minAdvanceDateStr()
      const closures: any[] = Array.isArray(data?.closures) ? data.closures : []
      const named = closures.filter(c => c?.label)
      const unnamedSome = closures.filter(c => !c?.label && Array.isArray(c?.setIds) && c.setIds.length)
      const whole: any[] = Array.isArray(data?.fullStudioSlots) ? data.fullStudioSlots : []

      const date_info = {
        date,
        day: dayName(date),
        today: dayName(today),
        is_past: date < today,
        bookable_online: date >= minDate,
        earliest_date_bookable_online: dayName(minDate),
        closed: named.map(c => ({ label: c.label, hours: range(c), applies_to: c.setIds ? 'some sets' : 'whole studio' })),
        note: date < today
          ? 'This date is in the past.'
          : date < minDate
            ? 'INSIDE THE 48-HOUR WINDOW: the website will NOT let anyone book this date online. Tell the visitor this first. Do not walk them through booking it.'
            : 'Bookable online, subject to the open hours below.',
      }

      const sets: Record<string, any> = data?.sets && typeof data.sets === 'object' ? data.sets : {}
      const wanted = input?.set_slug ? String(input.set_slug) : null
      const setsOut: Record<string, any> = {}
      for (const [slug, v] of Object.entries(sets)) {
        if (wanted && slug !== wanted) continue
        const booked = Array.isArray((v as any)?.bookedSlots) ? (v as any).bookedSlots : []
        setsOut[slug] = { name: (v as any)?.name, unavailable: [...whole, ...booked].map(range) }
      }

      const payload = {
        date_info,
        sets: setsOut,
        whole_studio_unavailable: whole.map(range),
        some_sets_also_unavailable: unnamedSome.map(range),
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
              ? "When the visitor asks to SEE a specific prop, show its picture INLINE by writing exactly ![<name>](photo) — this renders the photo right inside the chat, so do NOT send a plain link that would navigate the kiosk away. Do this ONLY for a specific prop they named; when they're just asking what's available, list names ONLY with no images. If photo is null, say a picture isn't on file. If it's unclear which prop they mean, ask which one first. Props are first-come-first-serve — don't promise a specific one is free at their booking time."
              : "No props matched. Point them to the full directory at /props or ask them to describe it another way.",
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

    if (name === 'log_knowledge_gap') {
      // Non-fatal by design: a missing june_questions table (migration 117 not
      // run) or any write error must never change what the visitor gets back.
      try {
        const question = String(input?.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
        if (question) {
          const { data: convo } = await ctx.supabase
            .from('agent_conversations').select('channel').eq('id', ctx.conversationId).maybeSingle()
          const { error } = await ctx.supabase.from('june_questions').insert({
            conversation_id: ctx.conversationId,
            channel: convo?.channel ?? (ctx.kiosk ? 'kiosk' : 'web'),
            question,
            kind: input?.kind === 'partial' ? 'partial' : 'not_in_knowledge',
          })
          if (error) console.error('[june] log_knowledge_gap insert failed (non-fatal):', error.message)
        }
      } catch (e) {
        console.error('[june] log_knowledge_gap error (non-fatal):', e)
      }
      return { result: 'Noted for the team. Now reply to the visitor as you normally would. Never mention that you logged anything.' }
    }

    if (name === 'escalate_to_teddy') {
      // 2026-11-25: one escalation per conversation. The test chat escalated on
      // three messages in a row = three pushes and "I flagged it again" each time.
      // CLAIM the status change; only the call that flips it sends the push.
      const { data: flipped } = await ctx.supabase
        .from('agent_conversations')
        .update({ status: 'needs_teddy' })
        .eq('id', ctx.conversationId)
        .neq('status', 'needs_teddy')
        .select('id')
      if (!flipped?.length) {
        return {
          result: 'Already flagged earlier in this chat; the team has it. Do NOT tell the visitor you flagged it again, and do not repeat the text number if you already gave it — just answer their latest message.',
          escalated: true,
        }
      }
      // Owner push alert — non-fatal. (Owner SMS dropped 2026-07-03: push covers
      // it free; customer-facing SMS unaffected.)
      try {
        const { sendOwnerPush } = await import('@/lib/push')
        await sendOwnerPush({
          title: '🔔 June needs you',
          body: String(input?.reason || 'A customer needs a human.').slice(0, 140),
          url: '/admin/inbox',
          tag: `june-escalate-${ctx.conversationId}`,
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

HOW YOU TALK — this matters as much as the rules below:
- Answer only what was asked. Don't add options, details, prices, sizes or steps nobody asked for. If more might help, offer it in a few words ("want me to suggest a set?") instead of dumping it.
- One or two short sentences is a normal reply. Go longer only when the visitor asks for detail, a comparison, or how to do something.
- No lists, no numbered steps, no bold, no headers. The ONLY markdown you use is the [label](path) link button. If someone asks what sets you have, name a few in a sentence and ask what look they're after — never list every set with its dimensions.
- At most one question per reply. Ask it when you need it to help (what they're shooting, which date), instead of guessing and listing everything.
- No filler openers ("Perfect!", "Great question!", "Absolutely!") and don't repeat back what they just said.
- Don't repeat yourself across the chat. Once you've given the text number, a caveat ("I can't promise") or said you flagged the team, don't say it again unless they ask. Each reply should only add what's new.
- Trust your tool results. Don't retract something a tool told you unless a newer tool result contradicts it.
- Warm and easygoing, like a good front-desk person texting back. You know the studio well, so sound sure, not scripted.
EXAMPLE. Visitor: "Can I book tomorrow at 11 for an hour, 2 people?"
  Wrong: a list of every open set with sizes, then booking steps, then a question.
  Right, if tomorrow is inside the 48-hour window: "Tomorrow's inside our 48-hour booking window, so the site won't take it online. Text (832) 408-1631 and the team will see if they can fit you in."
  Right, if the date is bookable: "11 is open on most sets that day. What kind of look are you going for? I'll point you to the right one."

QUALIFYING — find out just enough to point them to ONE right answer, before recommending anything:
- WHEN: if they gave a date, check it with check_availability first. If it's inside the 48-hour window, that is the answer; don't qualify further.
- WHAT they're shooting (portraits, product, video, content, a brand shoot). It decides the set, and it catches things that change the booking: audio recording, fog/haze, nudity, water, anything messy. For those, follow your KNOWLEDGE rules (often a full studio buyout or a review), never guess.
- HOW MANY people. One set holds 5 total. More than that means a second set or the full studio. A group needing two or more sets for around 4 hours or more: recommend the full studio buyout — it's simpler for everyone.
- Any special ask (a look, props, gear) that points to a particular set or rental.
How to qualify without interrogating:
- One question per reply, and only questions whose answer would change what you recommend.
- Never ask what they already told you. Re-read their messages first.
- Once you know enough, recommend one or two sets with a one-line reason each, using get_sets_and_pricing for the facts — not a menu of everything.
EXAMPLE.
  Visitor: "Do you have space for a shoot next Saturday?" → June: "We do. What are you shooting, and how many people?"
  Visitor: "Lingerie brand, 6 of us, about 4 hours." → June: "With 6 you'd be past one set's limit of 5, so it'd be two sets or the full studio for that long. Want me to check Saturday for a buyout?"

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
9. KNOWLEDGE GAPS: whenever a question isn't answered (fully or partly) by your KNOWLEDGE section or your tools, call log_knowledge_gap with the question BEFORE you reply. It's silent — never tell the visitor. Don't log greetings, off-topic chatter, or things your tools answered.
10. DATES AND HOLIDAYS: Never work out a weekday or a holiday date yourself — you get them wrong. Before you say ANYTHING about a specific date (that it's open, closed, a holiday, or which weekday it is), call check_availability and use its date_info. Only say the studio is closed or that a day is a holiday when date_info.closed lists it, and use that exact label. Hours listed as unavailable with no reason are simply not available — never guess or invent a reason. If a visitor corrects you about a date, call the tool again and answer from it; never just flip to agreeing.
11. 48-HOUR WINDOW: If date_info.bookable_online is false, the website will refuse that date. Say so plainly in your FIRST reply about it, before suggesting any sets or steps, and never walk anyone through booking a date inside the window. Tell them the earliest date they can book online (date_info.earliest_date_bookable_online), and that for a short-notice session they can text (832) 408-1631 — the team decides case by case, never promise it. If they want that session, use escalate_to_teddy so the team sees it right away.
12. When someone says the site won't let them book, check the date with check_availability before troubleshooting buttons or errors — the 48-hour window is the most common reason.

BOOKING WALK-THROUGH: The Book page flow is: choose Shared Set or Full Studio → pick set(s), date, and hours → add equipment if wanted → guest count → pay online. Bookings run in 30-minute increments with a 1-hour minimum, and need 48h notice; the site enforces it. Short-notice requests exist for logged-in members (subject to approval).

IMAGES: Emails sometimes include photos — attached or pasted into the message. You can see them. When someone sends a picture of a prop, a set, or a look they want, SAY what you can see so they know it arrived ("that vintage rotary phone —"), then act on it: search the catalog with get_props using words describing the object to check whether we have it or something close. If you genuinely can't tell what it is, say so and ask — don't guess, and never claim we have something get_props didn't return. If a file came through that you cannot see (a PDF, a document), say it arrived and that the team will look at it rather than pretending to have read it.

PRICING: Use get_sets_and_pricing for live numbers (a set's base member rate plus the per-hour guest surcharge = the guest rate). BY DEFAULT quote the guest rate as the price and invite people to sign up free for member rates — don't volunteer a "members $X vs guests $Y" breakdown. If someone directly asks what the member rate is, answer honestly and tell them it's free with an account. Don't quote prices from memory. The full-studio buyout is a flat rate and is not surcharged. Booking is BY APPOINTMENT ONLY — online in advance, no walk-ins.

KNOWLEDGE:
${kbText}`

  const dynamicPart = `CURRENT TIME (Houston): ${centralNow()}
VISITOR: ${opts.loggedIn ? `logged in${opts.visitorName ? ` as ${opts.visitorName}` : ''}` : 'not logged in'}${opts.page ? ` · currently on page: ${opts.page}` : ''}
${opts.page?.startsWith('kiosk') ? `
KIOSK MODE: This visitor is PHYSICALLY AT THE STUDIO right now, talking to you on the wall tablet. Adjust accordingly: give in-person directions (where things are in the building) when your knowledge covers it, remind them to check in on this tablet if they're here for a booking, and for anything hands-on (unlock something, equipment help, spills, emergencies) use escalate_to_teddy or tell them to tap "GET THE TEAM" on this screen.
WHICH ROOM YOU ARE IN: the VISITOR line above names the set this tablet is mounted in, after "kiosk ·" (e.g. "kiosk · Set A"). That is the room the guest is physically standing in. Answer "where is the bathroom", "how do I dim these", "is this the right set" and anything else spatial FROM THAT ROOM, and never ask a guest which set they are in when it is already named there. If no set is named, this tablet has not identified itself — ask which set they are in before giving directions.
NO LINKS ON THE KIOSK: NEVER put a tappable link in your reply here — tapping it navigates this shared tablet away from the kiosk and strands the next guest. Do NOT use [text](url) link markdown at all in kiosk mode. To point someone to booking or any web page, tell them in plain words to do it on their OWN phone (say the address as plain text, e.g. "book online at madekulture.com"), or to tap GET THE TEAM for help. The ONE exception: showing a prop's photo inline with ![name](photo) is fine — an image stays on the tablet and doesn't navigate.
EXTENSIONS AT THE KIOSK: If a guest wants extra time on their CURRENT session, use request_extension (1-2 hours). It never charges from this tablet — a confirm-and-pay text goes to the phone number on the booking, and only that phone can approve. If there's no checked-in guest context, ask for the booking's phone number first. Never promise the extension is done until they confirm on their phone. When the tool returns a refusal (no active booking, set booked next, no saved card), RELAY THAT EXACT REASON plainly — never call it a system error or hiccup.` : ''}${opts.page?.startsWith('email:') ? `
EMAIL MODE: This is an EMAIL, not the chat widget. Three things change.
NO MARKDOWN, EVER: an inbox renders none of it. [label](path) arrives as those literal characters, and a bare path like /props points nowhere from someone's mail client. Write every link as a FULL address on its own line, introduced in plain words — "Browse them all here:" then ${APP_URL}/props on the next line. Mail clients make a full https:// address clickable by themselves. Same for asterisks, backticks and # headers: don't use them.
GREET ONCE PER THREAD, NOT PER EMAIL: look at the history above. If you have already replied in this thread, do NOT open with "Hi <name>," again — no greeting line at all, just start with the answer. People do not re-introduce themselves halfway through a conversation, and doing it every time makes each message read like it came from someone who forgot the last one. Only greet on your FIRST reply in a thread. Never open with "Thanks for reaching out" on a reply either.
ANSWER IN FULL: the "one or two sentences" guidance above is for the chat widget. Email readers expect a real reply, so answer every question they asked completely — but still add nothing they didn't ask about. Above all, never say you're about to look something up or "pull up the list" and then just leave a link — an email is one-shot, there is no next turn to deliver it in. Call your tools first, then put the actual answer (the specific props, prices, times) in the message, with the link as a place to see photos rather than as a substitute for answering.` : ''}${!opts.page?.startsWith('kiosk') && !opts.page?.startsWith('email:') ? `
WEBSITE CHAT: This visitor is on the website (phone or computer), NOT at the studio. Never tell them to tap "GET THE TEAM" or use the kiosk/tablet — they can't see one. Even if a KNOWLEDGE line says "tap GET THE TEAM", on the website the human route is: text (832) 408-1631, or use escalate_to_teddy so the team follows up.` : ''}`

  return { staticPart, dynamicPart }
}

// ── Main entry ─────────────────────────────────────────────────────────────────

// Claude accepts these; anything else (PDF, HEIC, zip) we deliberately don't send.
export const VISION_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
// Hard per-image ceiling on the API side (~5MB). A photo bigger than this can't
// be shown either way, so we name it in the text and let a human look.
export const VISION_MAX_BYTES = 5_000_000
// base64 inflates by ~4/3, so anything above this would breach the 5MB limit
// once encoded even though the raw file is fine. Those go by URL instead —
// Anthropic fetches the bytes itself, so the encoding penalty disappears.
// A 4MB phone photo lands in exactly this gap, which is why the cap alone made
// vision useless in practice.
export const VISION_BASE64_MAX_BYTES = 3_500_000
// Cost/latency guard — plenty for "here's the prop I mean".
export const VISION_MAX_IMAGES = 3

export interface JuneImage {
  mediaType: string     // must be one of VISION_MIME_TYPES
  dataBase64?: string   // inline bytes (small images)
  url?: string          // publicly fetchable, short-lived (large images)
}

export interface JuneTurn {
  role: 'user' | 'agent' | 'teddy' | 'system'
  content: string
  // Images that came in with THIS turn (email attachments / body-embedded
  // photos). Only meaningful on a 'user' turn.
  images?: JuneImage[]
}

export interface JuneResult {
  reply: string
  escalated: boolean
}

// Non-fatal by design — never changes what the visitor gets back.
async function autoLogGap(supabase: any, conversationId: string, history: JuneTurn[], page?: string | null): Promise<void> {
  try {
    const last = [...history].reverse().find(m => m.role === 'user')
    const question = String(last?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
    if (!question) return
    const { data: convo } = await supabase
      .from('agent_conversations').select('channel').eq('id', conversationId).maybeSingle()
    const { error } = await supabase.from('june_questions').insert({
      conversation_id: conversationId,
      channel: convo?.channel ?? (page?.startsWith('kiosk') ? 'kiosk' : 'web'),
      question,
      kind: 'auto',
    })
    if (error) console.error('[june] auto gap log failed (non-fatal):', error.message)
  } catch (e) {
    console.error('[june] auto gap log error (non-fatal):', e)
  }
}

// 2026-11-25: when Anthropic refuses June for billing (credit balance empty),
// visitors only see a generic "something hiccuped" — so tell Teddy. At most one
// push an hour, tracked in studio_settings (serverless memory is per-instance).
// Never throws: the visitor's fallback reply must still go out.
async function alertBillingOnce(supabase: any): Promise<void> {
  try {
    const KEY = 'june_billing_alert_at'
    const { data } = await supabase.from('studio_settings').select('value').eq('key', KEY).maybeSingle()
    const last = Date.parse(String(data?.value ?? ''))
    if (Number.isFinite(last) && Date.now() - last < 3_600_000) return
    const now = new Date().toISOString()
    const { error } = data
      ? await supabase.from('studio_settings').update({ value: now }).eq('key', KEY)
      : await supabase.from('studio_settings').insert({ key: KEY, value: now })
    if (error) console.error('[june] billing alert stamp failed (sending anyway):', error.message)
    const { sendOwnerPush } = await import('@/lib/push')
    await sendOwnerPush({
      title: 'June is offline: API credit is empty',
      body: 'Anthropic refused her request for billing. Visitors are getting an error. Top up at platform.claude.com > Billing.',
      url: '/admin/inbox',
      tag: 'june-billing',
      requireInteraction: true,
    })
  } catch (e) {
    console.error('[june] billing alert failed (non-fatal):', e)
  }
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
  const messages: any[] = opts.history.slice(-24).map(m => {
    const role = m.role === 'user' ? 'user' : 'assistant'
    const text = m.role === 'teddy' ? `[Teddy, the owner, said]: ${m.content}` : m.content
    const imgs = (role === 'user' ? m.images : undefined) ?? []
    if (!imgs.length) return { role, content: text }
    // Images first, then the text — Claude reads a trailing question as being
    // about the images above it.
    return {
      role,
      content: [
        ...imgs.slice(0, VISION_MAX_IMAGES)
          .filter(img => img.dataBase64 || img.url)
          .map(img => ({
            type: 'image',
            source: img.url
              ? { type: 'url', url: img.url }
              : { type: 'base64', media_type: img.mediaType, data: img.dataBase64 },
          })),
        { type: 'text', text },
      ],
    }
  })

  let escalated = false
  let gapLogged = false

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelFor(opts.page),
        max_tokens: 700,
        system,
        tools: TOOLS,
        messages,
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      if (/credit balance|billing|insufficient|payment required/i.test(detail)) await alertBillingOnce(opts.supabase)
      throw new Error(`June API error: ${res.status} ${detail}`)
    }
    const data: any = await res.json()
    await recordAiUsage({
      feature: opts.page?.startsWith('email:') ? 'june_email' : opts.page?.startsWith('kiosk') ? 'june_kiosk' : 'june_web',
      model: modelFor(opts.page), usage: data.usage, conversationId: opts.conversationId,
    })

    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content })
      const results: any[] = []
      for (const block of data.content) {
        if (block.type !== 'tool_use') continue
        if (block.name === 'log_knowledge_gap') gapLogged = true
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
    // Safety net: June is told to call log_knowledge_gap on every miss but the
    // fast model skips it on "live data" questions. If her reply reads as a
    // punt and she didn't flag it, save the customer's message ourselves.
    if (text && !gapLogged && looksLikePunt(text)) {
      await autoLogGap(opts.supabase, opts.conversationId, opts.history, opts.page)
    }
    return { reply: text || "Sorry — I glitched for a second. Mind asking that again?", escalated }
  }

  return {
    reply: "I'm having trouble finishing that one — I've flagged it so Teddy can help. You can also text (832) 408-1631.",
    escalated,
  }
}
