'use client'
import { useEffect, useState } from 'react'

const svgProps = {
  width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}
const ThermometerIcon = () => (
  <svg {...svgProps}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
)
const DropletIcon = () => (
  <svg {...svgProps}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
)
const SunIcon = () => (
  <svg {...svgProps}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
)

interface Conditions {
  indoorTemp:  number | string | null
  humidity:    number | string | null
  outdoorTemp: number | string | null
}

const GOLD = '#d8a04c'

// Live studio conditions from the Nest thermostat (via /api/studio-temp).
// Renders nothing if the feed is unavailable, so it never shows a broken bar.
export default function StudioConditions({ align = 'center' }: { align?: 'center' | 'left' }) {
  const [data, setData] = useState<Conditions | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch('/api/studio-temp', { cache: 'no-store' })
        if (!res.ok) throw new Error('bad status')
        const d = await res.json()
        if (!active) return
        if (d?.indoorTemp == null && d?.outdoorTemp == null && d?.humidity == null) throw new Error('empty')
        setData(d)
        setFailed(false)
      } catch {
        if (active && !data) setFailed(true)
      }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000) // refresh every 5 min
    return () => { active = false; clearInterval(id) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null

  const item = (
    icon: React.ReactNode,
    value: number | string | null,
    unit: string,
    label: string,
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: GOLD, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 300, color: '#fff', lineHeight: 1 }}>
        {value ?? '--'}<span style={{ opacity: 0.6 }}>{unit}</span>
      </span>
      <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.4)', marginLeft: 2 }}>
        {label}
      </span>
    </div>
  )

  const divider = (
    <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
  )

  return (
    <div style={{
      display: 'flex',
      justifyContent: align === 'center' ? 'center' : 'flex-start',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 24,
      padding: '6px 0',
      width: '100%',
    }}>
      {item(<ThermometerIcon />, data?.indoorTemp ?? null, '°', 'STUDIO')}
      {divider}
      {item(<DropletIcon />, data?.humidity ?? null, '%', 'HUMIDITY')}
      {divider}
      {item(<SunIcon />, data?.outdoorTemp ?? null, '°', 'OUTSIDE')}
    </div>
  )
}
