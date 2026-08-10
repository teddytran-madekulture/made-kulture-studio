'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

// One place that answers "what price do I show this visitor?"
//
// ⚠️ The rule this mirrors lives in the CHECKOUT, not here:
//     const isMember = !!sessionUser          (app/api/bookings/route.ts)
//     guestSurchargeDollars = isMember ? 0 : surchargePerHour * setHours
// Simply being signed in earns the base rate. Studio buyouts are a flat rate
// and are never surcharged.
//
// It exists because two pages got this wrong in two different ways: /sets added
// the surcharge unconditionally (a signed-in member browsed at $50/hr and was
// charged $40/hr), and the home page didn't consult the database at all — its
// prices were hardcoded strings that couldn't follow a rate change either.
// Anything that displays a set rate should use this, so the catalogue can never
// again disagree with the till.

export interface PricedSet {
  id: string
  slug: string
  name: string
  rate_per_hour: number      // already adjusted for this visitor
  [k: string]: any
}

export function useGuestPricing() {
  const [rawSets, setRawSets] = useState<PricedSet[]>([])
  const [buyoutRate, setBuyoutRate] = useState(400)
  const [surcharge, setSurcharge] = useState(0)
  const [loading, setLoading] = useState(true)
  // null = not yet determined. Same pattern SiteNav uses.
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/sets')
      .then(r => r.json())
      .then(d => {
        setSurcharge(d.guestSurchargePerHour != null ? Number(d.guestSurchargePerHour) : 10)
        setRawSets((d.sets ?? []).map((x: any) => ({ ...x, rate_per_hour: Number(x.rate_per_hour) })))
        if (d.buyoutRate) setBuyoutRate(Number(d.buyoutRate))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setAuthed(!!user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setAuthed(!!s?.user))
    return () => subscription.unsubscribe()
  }, [])

  // Unknown auth counts as GUEST on purpose: the price may then correct
  // DOWNWARD once the session resolves, never upward. Quoting low and raising it
  // is the one direction that reads as a bait.
  const guestPricing = authed !== true

  // The "guest rates shown" notice waits for a definite false, so a signed-in
  // member never sees a flash of it.
  const showGuestNote = authed === false && surcharge > 0

  const sets = useMemo(
    () => rawSets.map(s => ({ ...s, rate_per_hour: s.rate_per_hour + (guestPricing ? surcharge : 0) })),
    [rawSets, guestPricing, surcharge],
  )

  // Look a rate up by slug. `fallback` covers the first paint before /api/sets
  // returns, and any slug the API doesn't know about.
  const rateFor = (slug: string, fallback?: number): number | null => {
    const hit = sets.find(s => s.slug === slug)
    if (hit) return hit.rate_per_hour
    if (fallback == null) return null
    // A hardcoded fallback is always written as the GUEST price, so take the
    // surcharge back off for a member rather than quoting them too much.
    return guestPricing ? fallback : Math.max(fallback - surcharge, 0)
  }

  return { sets, rateFor, buyoutRate, surcharge, guestPricing, showGuestNote, authed, loading }
}
