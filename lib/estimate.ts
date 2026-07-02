// Price a casting "plan" into an estimate, mirroring the booking engine:
//   space   = buyout ? buyoutRate*hours : setRate*hours
//   equip   = sum(rate * quantity)          (flat per session)
//   guests  = set && guests>capacity ? (over)*perPersonFee*hours : 0
// This is an ESTIMATE for planning — the real charge is calculated at checkout.

export type EquipLine = { id: string; name: string; rate: number; quantity: number }

export type Plan = {
  mode: 'none' | 'set' | 'buyout'
  setSlug?: string | null
  hours?: number | null
  guests?: number | null
  equipment?: EquipLine[]
}

export type Rates = {
  sets: { slug: string; name: string; rate_per_hour: number; capacity?: number }[]
  buyoutRate: number
  guestPricing: { capacityPerSet: number; perPersonFee: number }
}

export type EstimateLine = { label: string; amount: number }
export type Estimate = { lines: EstimateLine[]; total: number }

export function estimatePlan(plan: Plan, rates: Rates): Estimate {
  const lines: EstimateLine[] = []
  const hours = Math.max(0, Number(plan.hours) || 0)

  if (plan.mode === 'buyout' && hours > 0) {
    lines.push({
      label: `Full buyout · ${hours}hr × $${rates.buyoutRate}`,
      amount: rates.buyoutRate * hours,
    })
  } else if (plan.mode === 'set' && plan.setSlug && hours > 0) {
    const set = rates.sets.find(s => s.slug === plan.setSlug)
    if (set) {
      lines.push({
        label: `${set.name} · ${hours}hr × $${set.rate_per_hour}`,
        amount: set.rate_per_hour * hours,
      })
      const cap = rates.guestPricing.capacityPerSet
      const over = Math.max(0, (Number(plan.guests) || 0) - cap)
      if (over > 0) {
        lines.push({
          label: `Extra guests · ${over} × $${rates.guestPricing.perPersonFee} × ${hours}hr`,
          amount: over * rates.guestPricing.perPersonFee * hours,
        })
      }
    }
  }

  for (const e of plan.equipment ?? []) {
    const qty = Math.max(1, Number(e.quantity) || 1)
    lines.push({
      label: qty > 1 ? `${e.name} × ${qty}` : e.name,
      amount: (Number(e.rate) || 0) * qty,
    })
  }

  const total = lines.reduce((s, l) => s + l.amount, 0)
  return { lines, total }
}
