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
