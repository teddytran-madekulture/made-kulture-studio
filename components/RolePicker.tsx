'use client'
import { useState } from 'react'
import { ROLE_CATEGORIES, MAX_ROLES } from '@/lib/roles'

/**
 * Shared role selector used on signup, /welcome, and the profile editor.
 * - Searchable list of the full (categorized) role set + any owner-approved extras.
 * - Selected roles show as removable chips.
 * - Enforces a hard cap (MAX_ROLES by default).
 * - A typed role that matches nothing can be added as a custom "Other" — pages
 *   queue those to /api/roles/suggest on submit (a custom role is any value not
 *   present in `options`).
 */
export default function RolePicker({
  value,
  onChange,
  options,
  max = MAX_ROLES,
  label = 'What do you do?',
  hint,
}: {
  value: string[]
  onChange: (next: string[]) => void
  options: string[]
  max?: number
  label?: string
  hint?: string
}) {
  const [query, setQuery] = useState('')
  const atMax = value.length >= max
  const has = (role: string) => value.some(r => r.toLowerCase() === role.toLowerCase())

  const add = (role: string) => {
    const r = role.trim()
    if (!r || has(r) || value.length >= max) return
    onChange([...value, r])
    setQuery('')
  }
  const remove = (role: string) => onChange(value.filter(r => r !== role))

  const q = query.trim().toLowerCase()
  const available = options.filter(r => !has(r) && (!q || r.toLowerCase().includes(q)))

  // Group the available options by category; approved customs not in any
  // category fall under "More".
  const groups = ROLE_CATEGORIES.map(c => ({
    label: c.label,
    roles: available.filter(r => c.roles.includes(r)),
  })).filter(g => g.roles.length)
  const known = new Set(ROLE_CATEGORIES.flatMap(c => c.roles).map(r => r.toLowerCase()))
  const extra = available.filter(r => !known.has(r.toLowerCase()))
  if (extra.length) groups.push({ label: 'More', roles: extra })

  const exactExists = options.some(r => r.toLowerCase() === q) || has(q)
  const canAddCustom = q.length > 1 && !exactExists

  const chip = (on: boolean): React.CSSProperties => ({
    background: on ? '#fff' : 'transparent',
    color: on ? '#080808' : 'rgba(255,255,255,0.7)',
    border: on ? '1px solid #fff' : '1px solid rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: '7px 13px',
    fontFamily: 'Inter',
    fontSize: 12,
    cursor: 'pointer',
  })

  return (
    <div>
      <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
        {label}{' '}
        <span style={{ color: 'rgba(255,255,255,0.25)' }}>{hint ?? `(optional — pick up to ${max})`}</span>
      </div>

      {/* Selected roles */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {value.map(role => (
            <button
              type="button"
              key={role}
              onClick={() => remove(role)}
              style={chip(true)}
              title="Remove"
            >
              {role} ✕
            </button>
          ))}
        </div>
      )}

      {atMax ? (
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          Max {max} roles — remove one to pick something else.
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (available.length === 1) add(available[0])
                else if (canAddCustom) add(query.trim())
              }
            }}
            placeholder="Search roles (e.g. Singer, Retoucher, Dancer…)"
            maxLength={40}
            style={{
              width: '100%',
              background: '#141414',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              padding: '10px 12px',
              fontFamily: 'Inter',
              fontSize: 13,
              color: '#fff',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 10,
            }}
          />

          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map(g => (
              <div key={g.label}>
                <div style={{ fontFamily: 'Inter', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                  {g.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {g.roles.map(role => (
                    <button type="button" key={role} onClick={() => add(role)} style={chip(false)}>
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {canAddCustom && (
              <button
                type="button"
                onClick={() => add(query.trim())}
                style={{ ...chip(false), alignSelf: 'flex-start', borderStyle: 'dashed' }}
              >
                + Add &ldquo;{query.trim()}&rdquo;
              </button>
            )}

            {groups.length === 0 && !canAddCustom && (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                No matches.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
