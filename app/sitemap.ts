import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${APP_URL}/`,             changeFrequency: 'weekly',  priority: 1 },
    { url: `${APP_URL}/sets`,         changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${APP_URL}/book`,         changeFrequency: 'monthly', priority: 0.9 },
    { url: `${APP_URL}/props`,        changeFrequency: 'weekly',  priority: 0.6 },
    { url: `${APP_URL}/gear`,         changeFrequency: 'weekly',  priority: 0.6 },
    { url: `${APP_URL}/studio-rules`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${APP_URL}/tour`,         changeFrequency: 'monthly', priority: 0.6 },
    { url: `${APP_URL}/availability`, changeFrequency: 'daily',   priority: 0.5 },
  ]

  // One landing page per active set.
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } }
    )
    const { data } = await supabase.from('sets').select('slug').eq('is_active', true).not('slug', 'is', null)
    const setPages: MetadataRoute.Sitemap = (data ?? []).map(s => ({
      url: `${APP_URL}/sets/${s.slug}`, changeFrequency: 'monthly' as const, priority: 0.8,
    }))
    return [...staticPages, ...setPages]
  } catch {
    return staticPages
  }
}
