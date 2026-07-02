'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CREATIVE_ROLES } from '@/lib/roles'
import RolePicker from '@/components/RolePicker'
import { estimatePlan, type EquipLine, type Rates } from '@/lib/estimate'

type SetRow = { slug: string; name: string; rate_per_hour: number; capacity?: number }
type Gear = { id: string; name: string; rate: number; category: string }

export default function NewCastingPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [comp, setComp] = useState<'paid' | 'unpaid' | 'tfp'>('tfp')
  const [roles, setRoles] = useState<string[]>([])
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])

  const [mode, setMode] = useState<'none' | 'set' | 'buyout'>('none')
  const [setSlug, setSetSlug] = useState('')
  const [hours, setHours] = useState('')
  const [guests, setGuests] = useState('')
  const [cart, setCart] = useState<EquipLine[]>([])
  const [gearSearch, setGearSearch] = useState('')
  const [shootDate, setShootDate] = useState('')
  const [startHour, setStartHour] = useState('')

  const [sets, setSets] = useState<SetRow[]>([])
  const [buyoutRate, setBuyoutRate] = useState(400)
  const [guestPricing, setGuestPricing] = useState({ capacityPerSet: 5, perPersonFee: 10 })
  const [gearCatalog, setGearCatalog] = useState<Gear[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/roles').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
    fetch('/api/sets').then(r => r.json()).then(d => {
      setSets(d.sets ?? [])
      if (d.buyoutRate) setBuyoutRate(Number(d.buyoutRate))
      if (d.guestPricing) setGuestPricing({ capacityPerSet: d.guestPricing.capacityPerSet, perPersonFee: d.guestPricing.perPersonFee })
    }).catch(() => {})
    fetch('/api/equipment').then(r => r.json()).then(d => setGearCatalog(d.equipment ?? [])).catch(() => {})
  }, [])

  const rates: Rates = useMemo(() => ({
    sets: sets.map(s => ({ slug: s.slug, name: s.name, rate_per_hour: Number(s.rate_per_hour), capacity: s.capacity })),
    buyoutRate,
    guestPricing,
  }), [sets, buyoutRate, guestPricing])

  const estimate = useMemo(() => estimatePlan(
    { mode, setSlug, hours: Number(hours) || 0, guests: Number(guests) || 0, equipment: cart },
    rates,
  ), [mode, setSlug, hours, guests, cart, rates])

  const addGear = (g: Gear) => {
    setCart(prev => {
      const found = prev.find(l => l.id === g.id)
      if (found) return prev.map(l => l.id === g.id ? { ...l, quantity: l.quantity + 1 } : l)
      return [...prev, { id: g.id, name: g.name, rate: g.rate, quantity: 1 }]
    })
    setGearSearch('')
  }
  const removeGear = (id: string) => setCart(prev => prev.filter(l => l.id !== id))

  const submit = async () => {
    if (!title.trim()) { setError('Give your casting a title.'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/castings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description, compensation_type: comp, roles_needed: roles,
        plan_mode: mode,
        set_slug: mode === 'set' ? setSlug : null,
        hours: mode === 'none' ? null : (Number(hours) || null),
        guests: mode === 'set' ? (Number(guests) || null) : null,
        equipment: cart,
        shoot_date: shootDate || null,
        start_hour: startHour ? Number(startHour) : null,
        estimated_cost: estimate.total,
      }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok && d.id) router.push(`/account/castings/${d.id}`)
    else setError(d.error ?? 'Could not post.')
  }

  const input: React.CSSProperties = { width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '12px 14px', fontFamily: 'Inter', fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box' }
  const label: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', margin: '20px 0 8px' }
  const modeChip = (m: typeof mode, txt: string) => (
    <button type="button" onClick={() => setMode(m)} style={{
      background: mode === m ? '#fff' : 'transparent', color: mode === m ? '#080808' : 'rgba(255,255,255,0.7)',
      border: mode === m ? '1px solid #fff' : '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '7px 14px',
      fontFamily: 'Inter', fontSize: 12, cursor: 'pointer',
    }}>{txt}</button>
  )
  const compChip = (c: typeof comp, txt: string) => (
    <button type="button" onClick={() => setComp(c)} style={{
      background: comp === c ? '#fff' : 'transparent', color: comp === c ? '#080808' : 'rgba(255,255,255,0.7)',
      border: comp === c ? '1px solid #fff' : '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '7px 14px',
      fontFamily: 'Inter', fontSize: 12, cursor: 'pointer',
    }}>{txt}</button>
  )

  const q = gearSearch.trim().toLowerCase()
  const gearMatches = q ? gearCatalog.filter(g => g.name.toLowerCase().includes(q) && !cart.some(l => l.id === g.id)).slice(0, 6) : []

  return (
    <div style={{ maxWidth: 560 }}>
      <Link href="/account/castings" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← Castings</Link>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '8px 0 4px' }}>POST A CASTING</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: '0 0 8px' }}>Describe the shoot, who you need, and optionally plan the studio time to see an estimate.</p>

      {error && <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 6, padding: '10px 14px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b', marginTop: 16 }}>{error}</div>}

      <label style={label}>TITLE</label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Neon fashion editorial — need a model + MUA" maxLength={120} style={input} />

      <label style={label}>DESCRIPTION</label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="The concept, vibe, what you're looking for, and any details." rows={4} maxLength={2000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />

      <label style={label}>COMPENSATION</label>
      <div style={{ display: 'flex', gap: 8 }}>{compChip('paid', 'Paid')}{compChip('unpaid', 'Unpaid')}{compChip('tfp', 'TFP (trade)')}</div>

      <label style={label}>ROLES YOU NEED</label>
      <RolePicker value={roles} onChange={setRoles} options={roleOptions} max={8} label="Who do you need?" hint="(pick up to 8)" />

      <label style={label}>STUDIO PLAN <span style={{ textTransform: 'none', letterSpacing: 0, color: 'rgba(255,255,255,0.25)' }}>— optional, drives the estimate</span></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{modeChip('none', 'No studio plan')}{modeChip('set', 'Single set')}{modeChip('buyout', 'Full buyout')}</div>

      {mode !== 'none' && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'set' && (
            <select value={setSlug} onChange={e => setSetSlug(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">Choose a set…</option>
              {sets.map(s => <option key={s.slug} value={s.slug}>{s.name} — ${s.rate_per_hour}/hr</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Hours</div>
              <input type="number" min={1} value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 3" style={input} />
            </div>
            {mode === 'set' && (
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Total people</div>
                <input type="number" min={1} value={guests} onChange={e => setGuests(e.target.value)} placeholder="e.g. 4" style={input} />
              </div>
            )}
          </div>
        </div>
      )}

      <label style={label}>EQUIPMENT <span style={{ textTransform: 'none', letterSpacing: 0, color: 'rgba(255,255,255,0.25)' }}>— optional</span></label>
      <input value={gearSearch} onChange={e => setGearSearch(e.target.value)} placeholder="Search gear (lights, haze, camera…)" style={input} />
      {gearMatches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {gearMatches.map(g => (
            <button key={g.id} type="button" onClick={() => addGear(g)} style={{ display: 'flex', justifyContent: 'space-between', background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '9px 12px', fontFamily: 'Inter', fontSize: 13, color: '#fff', cursor: 'pointer' }}>
              <span>{g.name}</span><span style={{ color: 'rgba(255,255,255,0.4)' }}>+ ${g.rate}</span>
            </button>
          ))}
        </div>
      )}
      {cart.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {cart.map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
              <span>{l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name} <span style={{ color: 'rgba(255,255,255,0.4)' }}>· ${l.rate * l.quantity}</span></span>
              <button type="button" onClick={() => removeGear(l.id)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <label style={label}>DATE & START <span style={{ textTransform: 'none', letterSpacing: 0, color: 'rgba(255,255,255,0.25)' }}>— optional</span></label>
      <div style={{ display: 'flex', gap: 10 }}>
        <input type="date" value={shootDate} onChange={e => setShootDate(e.target.value)} style={{ ...input, flex: 1, colorScheme: 'dark' }} />
        <select value={startHour} onChange={e => setStartHour(e.target.value)} style={{ ...input, flex: 1, cursor: 'pointer' }}>
          <option value="">Start time</option>
          {Array.from({ length: 14 }, (_, i) => i + 9).map(h => (
            <option key={h} value={h}>{h > 12 ? h - 12 : h}:00 {h >= 12 ? 'PM' : 'AM'}</option>
          ))}
        </select>
      </div>

      {estimate.total > 0 && (
        <div style={{ background: 'rgba(230,192,122,0.06)', border: '1px solid rgba(230,192,122,0.25)', borderRadius: 8, padding: '14px 16px', marginTop: 22 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: '#e6c07a', marginBottom: 8 }}>ESTIMATED STUDIO COST</div>
          {estimate.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
              <span>{l.label}</span><span>${l.amount}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter', fontSize: 15, fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 6 }}>
            <span>Estimate</span><span>${estimate.total}</span>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Estimate only — the exact total is calculated at checkout.</div>
        </div>
      )}

      <button onClick={submit} disabled={saving} style={{ background: '#fff', color: '#080808', border: 'none', borderRadius: 6, padding: '14px 32px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', cursor: 'pointer', opacity: saving ? 0.6 : 1, marginTop: 24 }}>
        {saving ? 'POSTING…' : 'POST CASTING'}
      </button>
    </div>
  )
}
