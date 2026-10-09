import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SiteNav from '@/components/SiteNav'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies, headers } from 'next/headers'
import { isAdminAuthed } from '@/lib/admin-auth'
import DropClient from './DropClient'

// /drops/<slug> — one Set Drop: the concept, the progress bar, and the reserve
// form. Everything live comes from /api/drops/<slug>; this file only does the
// 404 and the link preview.

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function getMeta(slug: string) {
  const { data } = await supabaseAdmin().from('set_drops').select('name, tagline, description, hero_url, status').eq('slug', slug).maybeSingle()
  if (!data) return null
  if (data.status !== 'draft') return data
  // Drafts: admin preview only.
  try { return isAdminAuthed({ cookies: cookies(), headers: headers() } as any) ? data : null } catch { return null }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const d = await getMeta(params.slug)
  if (!d) return { title: 'Set Drop' }
  const desc = (d.tagline || d.description || `Reserve ${d.name}, a limited-run set at Made Kulture, Houston.`).slice(0, 300)
  return { title: `${d.name} — Set Drop`, description: desc, openGraph: { title: `${d.name} — Made Kulture`, description: desc, images: d.hero_url ? [d.hero_url] : undefined } }
}

export default async function DropPage({ params }: { params: { slug: string } }) {
  if (!(await getMeta(params.slug))) notFound()
  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="sets" />
      <DropClient slug={params.slug} />
    </main>
  )
}
