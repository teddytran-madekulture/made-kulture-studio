// The weekly "questions June couldn't answer" review.
//
// June calls the silent log_knowledge_gap tool whenever a question isn't in her
// KB (june_questions, migration 117). Once a week this folds the new rows into
// groups — "portfolio photo limit, asked 3x" — and drafts ONE knowledge line per
// group as an agent_kb_proposals row. Teddy saves it from the QUESTIONS tab.
//
// ⚠️ Nothing here writes to agent_kb. June's one guardrail is that she states
// only what's in the KB, so the save stays a human click (same rule as coach.ts).
// ⚠️ The reviewer only knows what's in the transcripts and the KB. When the
// answer isn't in either, the draft carries [FILL IN: …] instead of a guess —
// an invented fact in the KB would be repeated to every customer who asks.

import { sanitizeGroups } from './question-review-core'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
// Judgement work, runs once a week — same model as the coach.
const MODEL = process.env.JUNE_COACH_MODEL || 'claude-sonnet-4-5-20250929'
const MAX_QUESTIONS = 150

const RESPOND = {
  name: 'respond',
  description: 'Return the grouped questions and a draft knowledge line for each group.',
  input_schema: {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short name for the question, e.g. "Portfolio photo limit"' },
            question_ids: { type: 'array', items: { type: 'string' }, description: 'ids of the NEW questions in this group' },
            existing_group_id: { type: 'string', description: 'If these are the same question as an OPEN group listed, that group id. Otherwise omit.' },
            proposal: {
              type: 'object',
              description: 'Draft KB line that would let June answer next time. Omit if the question is not something the KB should cover (spam, off-topic, a one-off personal situation).',
              properties: {
                mode: { type: 'string', enum: ['new', 'update'] },
                kb_id: { type: 'string', description: 'Only for mode=update: the id of the KB entry to replace' },
                topic: { type: 'string', description: 'snake_case topic key' },
                content: { type: 'string', description: 'The full KB entry text. For update, the WHOLE rewritten entry, not just the added sentence. Use [FILL IN: what is needed] for any fact you do not know for certain.' },
                reason: { type: 'string', description: 'One line for Teddy: where the answer came from, or what he needs to fill in' },
              },
              required: ['mode', 'topic', 'content', 'reason'],
            },
          },
          required: ['label', 'question_ids'],
        },
      },
    },
    required: ['groups'],
  },
} as const

function system(kbText: string): string {
  return `You review the questions that June — the AI front desk at Made Kulture, a Houston studio rental — could not answer this week, so the owner can teach her.

YOUR JOB:
1. Group the NEW questions by what the customer actually wanted to know. Different wording for the same thing = one group ("how many pics can I post" and "portfolio limit?" are one group). Every new question id must appear in exactly one group.
2. If a new question is the same as an OPEN group listed below, put it in a group with that existing_group_id instead of making a new one.
3. For each group, draft the knowledge line that would let June answer next time.

FACT RULES — this is the important part:
- Use ONLY facts stated in June's current KNOWLEDGE below or said by TEDDY (the owner) in the transcripts. A customer's claim is not a fact.
- If you don't know the answer for certain, write the line with [FILL IN: exactly what is needed] where the fact goes. NEVER guess a number, price, policy or limit. A wrong line gets repeated to every customer.
- If an existing KB entry is the natural home, use mode "update" with its kb_id and return the WHOLE entry rewritten, keeping everything it already says.
- Write the KB line the way the existing entries read: plain sentences June can quote, no markdown.
- No customer names, emails or phone numbers anywhere.
- Skip the proposal for spam, off-topic, or one-off personal situations that no KB line would fix.

JUNE'S CURRENT KNOWLEDGE (id · topic · content):
${kbText || '(empty)'}`
}

export type ReviewResult = {
  ok: boolean
  questions: number
  groupsCreated: number
  groupsUpdated: number
  proposals: number
  labels: string[]   // groups touched this run, most-asked first — for the push
  error?: string
}

type Q = { id: string; conversation_id: string | null; channel: string | null; question: string; kind: string; created_at: string }

export async function runQuestionReview(supabase: any): Promise<ReviewResult> {
  const empty = { questions: 0, groupsCreated: 0, groupsUpdated: 0, proposals: 0, labels: [] as string[] }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, ...empty, error: 'ANTHROPIC_API_KEY missing' }

  const { data: qs, error: qErr } = await supabase
    .from('june_questions')
    .select('id, conversation_id, channel, question, kind, created_at')
    .is('group_id', null)
    .order('created_at', { ascending: true })
    .limit(MAX_QUESTIONS)
  // Fail loudly — a failed read reporting "no questions" is the silent-failure bug.
  if (qErr) return { ok: false, ...empty, error: `june_questions read failed: ${qErr.message}` }
  const questions: Q[] = qs ?? []
  if (!questions.length) return { ok: true, ...empty }

  const [{ data: kb, error: kbErr }, { data: open, error: gErr }] = await Promise.all([
    supabase.from('agent_kb').select('id, topic, content').eq('enabled', true).order('topic'),
    supabase.from('june_question_groups').select('id, label, examples, ask_count, conversation_ids, channels, first_asked_at, proposal_id').eq('status', 'open').limit(100),
  ])
  if (kbErr) return { ok: false, ...empty, error: `agent_kb read failed: ${kbErr.message}` }
  if (gErr) return { ok: false, ...empty, error: `june_question_groups read failed: ${gErr.message}` }
  const openGroups: any[] = open ?? []

  // Transcripts, so a question Teddy answered by hand in-thread can become a KB
  // line with his own words. Capped per conversation to keep the prompt sane.
  const convoIds = Array.from(new Set(questions.map(q => q.conversation_id).filter(Boolean))) as string[]
  const transcripts: Record<string, string> = {}
  if (convoIds.length) {
    const { data: msgs } = await supabase
      .from('agent_messages')
      .select('conversation_id, role, content, created_at')
      .in('conversation_id', convoIds.slice(0, 60))
      .in('role', ['user', 'agent', 'teddy'])
      .order('created_at', { ascending: true })
      .limit(2000)
    for (const m of msgs ?? []) {
      const who = m.role === 'user' ? 'CUSTOMER' : m.role === 'teddy' ? 'TEDDY' : 'JUNE'
      const line = `${who}: ${String(m.content ?? '').slice(0, 600)}`
      const cur = transcripts[m.conversation_id] ?? ''
      if (cur.length < 4000) transcripts[m.conversation_id] = cur + (cur ? '\n' : '') + line
    }
  }

  const kbText = (kb ?? []).map((r: any) => `${r.id} · ${r.topic} · ${r.content}`).join('\n\n')
  const ask = [
    'NEW QUESTIONS (id · channel · question):',
    ...questions.map(q => `${q.id} · ${q.channel ?? 'web'} · ${q.question}${q.kind === 'partial' ? ' (partly answered)' : q.kind === 'auto' ? ' (raw customer message, caught automatically — may include other chatter; the TRANSCRIPT shows what June could not answer)' : ''}`),
    '',
    'OPEN GROUPS FROM EARLIER WEEKS (id · label · examples):',
    ...(openGroups.length ? openGroups.map(g => `${g.id} · ${g.label} · ${JSON.stringify(g.examples).slice(0, 300)}`) : ['(none)']),
    '',
    'TRANSCRIPTS:',
    ...Object.entries(transcripts).map(([id, t]) => `--- conversation ${id} ---\n${t}`),
  ].join('\n')

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: system(kbText),
      tools: [RESPOND],
      tool_choice: { type: 'tool', name: 'respond' },
      messages: [{ role: 'user', content: ask }],
    }),
  })
  if (!res.ok) return { ok: false, ...empty, questions: questions.length, error: `Review API error: ${res.status} ${(await res.text()).slice(0, 300)}` }
  const data: any = await res.json()
  const block = (data.content ?? []).find((b: any) => b.type === 'tool_use' && b.name === 'respond')
  const rawGroups: any[] = Array.isArray(block?.input?.groups) ? block.input.groups : []

  const byId = new Map(questions.map(q => [q.id, q]))
  const openById = new Map(openGroups.map(g => [g.id, g]))
  const knownKb = new Set((kb ?? []).map((r: any) => r.id))
  const groups = sanitizeGroups(questions, rawGroups)

  let groupsCreated = 0, groupsUpdated = 0, proposals = 0
  const touched: { label: string; n: number }[] = []
  const now = new Date().toISOString()

  for (const g of groups) {
    const qsIn: Q[] = g.ids.map((id: string) => byId.get(id)!)
    const convs = Array.from(new Set(qsIn.map(q => q.conversation_id).filter(Boolean))) as string[]
    const chans = Array.from(new Set(qsIn.map(q => q.channel ?? 'web')))
    const phrasings = qsIn.map(q => q.question)
    const first = qsIn[0].created_at
    const last = qsIn[qsIn.length - 1].created_at
    const existing = g.existing_group_id ? openById.get(String(g.existing_group_id)) : null

    // Draft proposal (agent_kb_proposals needs a conversation — use the latest).
    let proposalId: string | null = null
    const p = g.proposal
    const anchorConvo = convs[convs.length - 1] ?? existing?.conversation_ids?.slice(-1)[0] ?? null
    if (p && anchorConvo && !existing?.proposal_id) {
      const topic = String(p.topic ?? '').trim().slice(0, 80)
      const content = String(p.content ?? '').trim().slice(0, 4000)
      const isUpdate = p.mode === 'update' && knownKb.has(String(p.kb_id ?? ''))
      if (topic && content) {
        const { data: ins, error } = await supabase.from('agent_kb_proposals').insert({
          conversation_id: anchorConvo,
          mode: isUpdate ? 'update' : 'new',
          kb_id: isUpdate ? String(p.kb_id) : null,
          topic, content,
          reason: String(p.reason ?? '').trim().slice(0, 300),
          source: 'questions',
        }).select('id').single()
        if (error) console.error('[question-review] proposal insert failed:', error.message)
        else { proposalId = ins.id; proposals++ }
      }
    }

    let groupId: string
    if (existing) {
      const examples = [...(existing.examples ?? []), ...phrasings].slice(-5)
      const { error } = await supabase.from('june_question_groups').update({
        ask_count: (existing.ask_count ?? 0) + qsIn.length,
        examples,
        conversation_ids: Array.from(new Set([...(existing.conversation_ids ?? []), ...convs])),
        channels: Array.from(new Set([...(existing.channels ?? []), ...chans])),
        last_asked_at: last,
        ...(proposalId ? { proposal_id: proposalId } : {}),
        updated_at: now,
      }).eq('id', existing.id)
      if (error) { console.error('[question-review] group update failed:', error.message); continue }
      groupId = existing.id; groupsUpdated++
      touched.push({ label: existing.label, n: qsIn.length })
    } else {
      const { data: ins, error } = await supabase.from('june_question_groups').insert({
        label: (g.label || phrasings[0]).slice(0, 120),
        ask_count: qsIn.length,
        examples: phrasings.slice(0, 5),
        conversation_ids: convs,
        channels: chans,
        proposal_id: proposalId,
        first_asked_at: first,
        last_asked_at: last,
      }).select('id').single()
      if (error) { console.error('[question-review] group insert failed:', error.message); continue }
      groupId = ins.id; groupsCreated++
      touched.push({ label: (g.label || phrasings[0]).slice(0, 120), n: qsIn.length })
    }

    // Only mark questions grouped once their group row exists — otherwise a
    // failed insert would leave them looking reviewed and they'd never resurface.
    await supabase.from('june_questions').update({ group_id: groupId }).in('id', g.ids).is('group_id', null)
  }

  const labels = touched.sort((a, b) => b.n - a.n).map(t => t.label)
  return { ok: true, questions: questions.length, groupsCreated, groupsUpdated, proposals, labels }
}
