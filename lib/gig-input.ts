// GIGS (migration 185) — the ONE validator for a gig's editable fields, used by
// the member post route, the poster's edit, and the admin "post for a company"
// form, so the three can never accept different things.
import { centralToday, gigExpiry, GIG_PAY_TBD } from '@/lib/gigs'

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export type GigFields = {
  company_name: string; title: string; description: string | null; roles_needed: string[]; pay: string
  gig_date: string | null; date_note: string | null; location: string | null; at_studio: boolean
  apply_by: string | null; expires_at: string
}

// opts.draft (2026-11-23): a DRAFT only needs a title, so a half-finished gig
// can be saved. Pay and roles are checked when it is published, through this
// same function without the flag — so a draft can never go live unchecked.
// opts.allowTbd: ADMIN routes only. pay_tbd: true stores GIG_PAY_TBD as the pay,
// for a company that confirmed it's paid but hasn't named a rate yet.
export function parseGigBody(b: any, opts: { draft?: boolean; allowTbd?: boolean } = {}): { row: GigFields } | { error: string } {
  const draft = opts.draft === true
  const title = str(b?.title, 120)
  if (!title) return { error: 'Give the gig a title.' }
  const pay = opts.allowTbd === true && b?.pay_tbd === true ? GIG_PAY_TBD : str(b?.pay, 80)
  // Paid gigs only: there has to be a number in it.
  if (!draft && pay !== GIG_PAY_TBD && (!pay || !/\d/.test(pay))) return { error: 'Gigs are paid work. Add the rate or budget, like "$400 / day".' }
  const roles = Array.isArray(b?.roles_needed)
    ? Array.from(new Set(b.roles_needed.map((r: unknown) => String(r).trim()).filter(Boolean))).slice(0, 8) as string[]
    : []
  if (!draft && !roles.length) return { error: 'Pick at least one role you are hiring for.' }
  const today = centralToday()
  const gig_date = isDate(b?.gig_date) ? b.gig_date : null
  const apply_by = isDate(b?.apply_by) ? b.apply_by : null
  if (apply_by && apply_by < today) return { error: 'The apply-by date is already past.' }
  if (gig_date && gig_date < today) return { error: 'The gig date is already past.' }
  return {
    row: {
      company_name: str(b?.company_name, 80),
      title,
      description: str(b?.description, 3000) || null,
      roles_needed: roles,
      pay,
      gig_date,
      date_note: str(b?.date_note, 80) || null,
      location: str(b?.location, 120) || null,
      at_studio: b?.at_studio === true,
      apply_by,
      expires_at: gigExpiry(apply_by),
    },
  }
}
