// Coaching June — revise a draft by talking to her, and let her learn facts.
//
// Two jobs, one call, because they're the same moment: Teddy says "we do have a
// black fabric, put that in" and that sentence is BOTH an edit instruction AND a
// fact she didn't know. Splitting them would make him say it twice.
//
// Modes:
//   'revise' — he typed an instruction about the draft. Rewrite it, and if the
//              instruction carried a durable studio fact, propose remembering it.
//   'learn'  — he wrote or heavily edited the reply himself and it's already
//              sent. Nothing to rewrite; just look for what she didn't know.
//
// Nothing here writes to agent_kb. It only proposes; the save is Teddy's click.
// That matters: June's one real guardrail is that she states only what's in the
// KB, so anything that can write to the KB without a human is a hole in it.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
// Deliberately not the Haiku that answers customers. This job is judgement —
// "is that a durable fact or a one-off?" — and it runs a handful of times a day,
// not on every inbound email, so the cost difference is noise.
const MODEL = process.env.JUNE_COACH_MODEL || 'claude-sonnet-4-5-20250929'

export interface KbEntryLite {
  id: string
  topic: string
  content: string
}

export interface CoachProposal {
  mode: 'new' | 'update'
  kbId?: string | null
  topic: string
  content: string
  reason: string
}

export interface CoachResult {
  note: string                 // June's short conversational reply to Teddy
  revisedDraft: string | null  // null in 'learn' mode, or when he asked for no edit
  proposals: CoachProposal[]
}

export interface CoachTurn {
  role: string                 // user | agent | teddy | draft | system
  content: string
}

const RESPOND = {
  name: 'respond',
  description: 'Reply to Teddy, optionally with a rewritten draft and knowledge to remember.',
  input_schema: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description:
          "One or two sentences to Teddy, in June's voice, about what you changed. Not a summary of the email — he can read it. If you are proposing knowledge, do not restate it here; the card shows it.",
      },
      revised_draft: {
        type: 'string',
        description:
          'The complete rewritten email body, ready to send. Omit entirely if there is no draft to revise or he asked for something that is not an edit.',
      },
      proposals: {
        type: 'array',
        description:
          'Durable studio facts worth remembering that are NOT already covered. Empty array is the common and correct answer.',
        items: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['new', 'update'],
              description: "'update' when an existing entry is wrong or incomplete, 'new' for a subject not covered.",
            },
            kb_id: { type: 'string', description: 'Required when mode is update: the id of the entry to replace.' },
            topic: { type: 'string', description: 'Short lowercase_snake topic key, e.g. backdrops. Reuse the existing key when updating.' },
            content: {
              type: 'string',
              description:
                'The fact as June should know it: plain, complete, third-person, no greeting. Include only what Teddy actually said.',
            },
            reason: { type: 'string', description: 'One short line on where this came from, e.g. "you told Michael we have this".' },
          },
          required: ['mode', 'topic', 'content', 'reason'],
        },
      },
    },
    required: ['note', 'proposals'],
  },
}

function buildSystem(kb: KbEntryLite[], mode: 'revise' | 'learn'): string {
  const kbText = kb.map(e => `[${e.id}] ${e.topic}: ${e.content}`).join('\n\n')

  return `You are June, the front-desk assistant at Made Kulture, a creative studio rental in Houston. You draft customer emails and Teddy — the owner — approves them.

Right now you are NOT talking to a customer. You are talking to Teddy, in private, about a reply. Speak to him like a colleague: short, direct, no customer-service voice, no signature.

${mode === 'revise' ? `HE IS GIVING YOU AN INSTRUCTION ABOUT THE DRAFT.
Do exactly what he asks and nothing more. "Leave out the pricing" means remove the pricing and change nothing else — do not also rewrite the greeting, reorder paragraphs, or improve wording he did not mention. Return the COMPLETE email body every time, not a fragment or a diff. Keep his facts and figures exactly as he gave them.
If what he said is not an edit at all (just teaching you something, or asking a question), leave revised_draft out and answer him.` : `HE ALREADY SENT THIS REPLY HIMSELF, or rewrote yours before sending.
There is nothing to redraft. Your only job is to notice what he knew that you did not, so you get it right next time. Do not comment on his writing.`}

REMEMBERING THINGS — be strict about this. You get facts wrong when you guess, and a saved line is one you will state to customers as certain for months.

Propose a fact ONLY when ALL of these hold:
- Teddy stated it himself, in plain terms. Not something you inferred, concluded, or think follows from it.
- It is durable — true next month, not just for this customer or this booking.
- It is about the studio: inventory, props, equipment, policy, pricing, the space, how things work.
- Nothing in your knowledge below already covers it.

Never propose: a decision about one customer ("let Michael move his session"), anything about a specific person, a date or booking, a one-off exception, a maybe, or your own advice that he simply did not argue with.

Write the content as a fact, not as a message: "A 10x20 black fabric backdrop is available; it is stored in the prop room." Not "Yes! We do have that." Include only what he said — if he said black fabric and did not give a size, do not invent one.

If something you already know is WRONG, use mode 'update' with that entry's id so the wrong line is replaced. Two entries that contradict each other are worse than one wrong entry, because you will pick between them at random.

Most of the time the right answer is an empty proposals list. An empty list is not a failure.

YOUR CURRENT KNOWLEDGE (id, topic, content):
${kbText || '(empty)'}`
}

export function coachConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export async function runCoach(opts: {
  mode: 'revise' | 'learn'
  kb: KbEntryLite[]
  history: CoachTurn[]        // oldest → newest
  currentDraft?: string | null
  instruction?: string        // revise mode: what Teddy typed
  sentReply?: string          // learn mode: what he actually sent
}): Promise<CoachResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Not configured (ANTHROPIC_API_KEY missing)')

  const transcript = opts.history.slice(-20).map(m => {
    const who = m.role === 'user' ? 'CUSTOMER'
      : m.role === 'teddy' ? 'TEDDY (sent to the customer)'
      : m.role === 'agent' ? 'JUNE (sent)'
      : m.role === 'draft' ? 'JUNE (draft)'
      : 'SYSTEM'
    return `${who}:\n${m.content}`
  }).join('\n\n---\n\n')

  const ask = opts.mode === 'revise'
    ? `THE THREAD SO FAR:\n\n${transcript}\n\n---\n\nTHE DRAFT YOU ARE EDITING:\n${opts.currentDraft ?? '(no draft)'}\n\n---\n\nTEDDY SAYS:\n${opts.instruction ?? ''}`
    : `THE THREAD SO FAR:\n\n${transcript}\n\n---\n\nWHAT TEDDY ACTUALLY SENT:\n${opts.sentReply ?? ''}\n\n---\n\nWhat did he know that you did not? If nothing, return an empty proposals list and say so briefly.`

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: buildSystem(opts.kb, opts.mode),
      tools: [RESPOND],
      // Force the structured answer — a prose reply here would mean parsing an
      // email body out of chat text, which is exactly how a stray "Sure!" ends
      // up at the top of a customer's message.
      tool_choice: { type: 'tool', name: 'respond' },
      messages: [{ role: 'user', content: ask }],
    }),
  })
  if (!res.ok) throw new Error(`Coach API error: ${res.status} ${await res.text()}`)

  const data: any = await res.json()
  const block = (data.content ?? []).find((b: any) => b.type === 'tool_use' && b.name === 'respond')
  if (!block) throw new Error('Coach returned no structured response')

  const input = block.input ?? {}
  const known = new Set(opts.kb.map(e => e.id))

  const proposals: CoachProposal[] = (Array.isArray(input.proposals) ? input.proposals : [])
    .map((p: any): CoachProposal | null => {
      const topic = String(p?.topic ?? '').trim().slice(0, 80)
      const content = String(p?.content ?? '').trim().slice(0, 4000)
      if (!topic || !content) return null
      // An 'update' pointing at an id that isn't in the KB would silently write
      // nothing on save, so demote it to a new entry rather than lose the fact.
      const kbId = String(p?.kb_id ?? '').trim()
      const isUpdate = p?.mode === 'update' && known.has(kbId)
      return {
        mode: isUpdate ? 'update' : 'new',
        kbId: isUpdate ? kbId : null,
        topic,
        content,
        reason: String(p?.reason ?? '').trim().slice(0, 300),
      }
    })
    .filter((p: CoachProposal | null): p is CoachProposal => p !== null)
    .slice(0, 5)

  const revised = typeof input.revised_draft === 'string' ? input.revised_draft.trim() : ''

  return {
    note: String(input.note ?? '').trim() || 'Done.',
    revisedDraft: opts.mode === 'revise' && revised ? revised : null,
    proposals,
  }
}
