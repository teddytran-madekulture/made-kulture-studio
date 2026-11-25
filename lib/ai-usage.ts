// Records every Claude API call the site makes, with its cost (migration 193).
// Read by /api/admin/ai-usage → the cost strip at the top of the June Inbox.
//
// ⚠️ Prices are USD per MILLION tokens, copied from Anthropic's pricing page
// (platform.claude.com/docs/en/about-claude/pricing) on 2026-11-25. When a model
// changes, add its line here or its calls are logged with cost NULL.
// ⚠️ Never throws: a logging problem must never break a customer's chat.

import { createClient } from '@supabase/supabase-js'

type Price = { input: number; output: number; cacheWrite: number; cacheRead: number }

const PRICES: Record<string, Price> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  'claude-haiku-5-5':  { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  'claude-haiku-4-5':  { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
}

// Longest key first, so a dated id like claude-haiku-4-5-20251001 matches its family.
function priceFor(model: string): Price | null {
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find(k => model.startsWith(k))
  return key ? PRICES[key] : null
}

export function costUsd(model: string, u: any): number | null {
  const p = priceFor(model)
  if (!p || !u) return null
  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  return (
    n(u.input_tokens) * p.input +
    n(u.output_tokens) * p.output +
    n(u.cache_creation_input_tokens) * p.cacheWrite +
    n(u.cache_read_input_tokens) * p.cacheRead
  ) / 1_000_000
}

let client: any = null
function db() {
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return client
}

export async function recordAiUsage(opts: { feature: string; model: string; usage: any; conversationId?: string | null }): Promise<void> {
  try {
    const u = opts.usage || {}
    const int = (v: any) => Math.max(0, Math.round(Number(v) || 0))
    const { error } = await db().from('ai_usage').insert({
      feature: opts.feature,
      model: opts.model,
      conversation_id: opts.conversationId ?? null,
      input_tokens: int(u.input_tokens),
      output_tokens: int(u.output_tokens),
      cache_read_tokens: int(u.cache_read_input_tokens),
      cache_write_tokens: int(u.cache_creation_input_tokens),
      cost_usd: costUsd(opts.model, u),
    })
    if (error) console.error('[ai-usage] insert failed (non-fatal):', error.message)
  } catch (e: any) {
    console.error('[ai-usage] failed (non-fatal):', e?.message || e)
  }
}
