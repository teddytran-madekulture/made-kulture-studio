'use client'
// Public directory counts for the home teaser and /directory landing page.
// See app/api/directory/stats/route.ts — counts only, never names or photos.
import { useEffect, useState } from 'react'

export type DirectoryStats = { total: number; newThisMonth?: number; brands: number; roles: { role: string; count: number }[] }

export function useDirectoryStats(): DirectoryStats | null {
  const [s, setS] = useState<DirectoryStats | null>(null)
  useEffect(() => {
    fetch('/api/directory/stats').then(r => (r.ok ? r.json() : null)).then(d => { if (d && typeof d.total === 'number') setS(d) }).catch(() => {})
  }, [])
  return s
}

/** The one-line headline count: "33 MEMBERS AND GROWING", plus "+6 THIS MONTH"
 *  once at least two joined in 30 days. Null until there are enough to show. */
export function memberCountLine(s: DirectoryStats | null, minTotal = 8): { count: number; rest: string; recent: number } | null {
  if (!s || s.total < minTotal) return null
  return { count: s.total, rest: 'MEMBERS AND GROWING', recent: (s.newThisMonth ?? 0) >= 2 ? s.newThisMonth! : 0 }
}

const plural = (role: string, n: number) => (n === 1 || /s$/i.test(role) ? role : `${role}s`)

/** Top roles as display strings, e.g. "48 Photographers". Empty until there is
 *  enough to be worth showing — a row of "1 Model · 1 Stylist" undersells it. */
export function topRoleLines(s: DirectoryStats | null, max = 4, minTotal = 8): string[] {
  if (!s || s.total < minTotal) return []
  return s.roles.slice(0, max).map(r => `${r.count} ${plural(r.role, r.count)}`)
}
