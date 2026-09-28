// Pure part of the weekly question review, kept apart so it can be unit-tested
// without Supabase or the API.
//
// Takes the model's raw grouping and makes it safe to write:
//  - unknown ids and ids already placed in an earlier group are dropped, so one
//    question is never counted twice or filed under a group that doesn't exist;
//  - empty groups are dropped;
//  - any question the model skipped gets a group of its own — a question that
//    silently disappears is exactly what this feature exists to prevent.
export type SafeGroup = { label: string; ids: string[]; existing_group_id?: string; proposal?: any }

export function sanitizeGroups(
  questions: { id: string; question: string }[],
  raw: any[],
): SafeGroup[] {
  const known = new Set(questions.map(q => q.id))
  const placed = new Set<string>()
  const out: SafeGroup[] = []
  for (const g of Array.isArray(raw) ? raw : []) {
    const ids = (Array.isArray(g?.question_ids) ? g.question_ids : [])
      .map((x: any) => String(x))
      .filter((id: string) => known.has(id) && !placed.has(id))
    if (!ids.length) continue
    ids.forEach((id: string) => placed.add(id))
    out.push({
      label: String(g?.label ?? '').trim(),
      ids,
      existing_group_id: g?.existing_group_id ? String(g.existing_group_id) : undefined,
      proposal: g?.proposal ?? null,
    })
  }
  for (const q of questions) {
    if (!placed.has(q.id)) out.push({ label: q.question.slice(0, 80), ids: [q.id], proposal: null })
  }
  return out
}

// Safety net for June's own log_knowledge_gap flag, which the fast model skips
// on questions it sees as "live data" rather than "missing knowledge" (first
// real test, 2026-09-28: "how many members are in the creative directory?" got
// a punt and no flag). True when a reply reads as June not having the answer.
// ⚠️ Deliberately does NOT match the studio phone number alone — plenty of
// ordinary answers say "text (832) 408-1631" and they are not misses.
const PUNT_PATTERNS: RegExp[] = [
  /\bI (?:don'?t|do not) have (?:that|the|this|access|info|information|a tool|any|details|specifics|an exact|exact)\b/i,
  /\bI (?:don'?t|do not) (?:know|see) (?:the|that|if|whether|how|what|exactly)\b/i,
  /\bI'?m not (?:sure|certain)\b/i,
  /\bnot (?:in|part of) my (?:info|information|knowledge|notes)\b/i,
  /\b(?:don'?t|do not|can'?t|cannot) (?:have access|see|look up|check)\b/i,
  /\bgood question for the team\b/i,
  /\b(?:let me|I'?ll|I will) check with the team\b/i,
  /\bthe team (?:can|will|would) (?:tell|confirm|let) you\b/i,
]

export function looksLikePunt(reply: string): boolean {
  return PUNT_PATTERNS.some(re => re.test(reply))
}
