// Client-safe helpers for 'list' (repeater) content fields. Kept separate from
// lib/site-content.ts so client components can import the parser without
// pulling @supabase/supabase-js into the public bundle.

export type ListItem = Record<string, string>

// Parse a list field's raw value (a JSON string) into an array of items.
// Tolerant: anything malformed returns [].
export function parseList(raw: string | undefined | null): ListItem[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(x => x && typeof x === 'object').map(x => {
      const out: ListItem = {}
      for (const [k, val] of Object.entries(x)) out[k] = val == null ? '' : String(val)
      return out
    })
  } catch {
    return []
  }
}
