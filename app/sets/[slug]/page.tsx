import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import SiteNav from '@/components/SiteNav'

// Individual landing page per set — one indexable page per space so searches
// like "studio with pool Houston" have somewhere specific to land. Linked from
// the /sets catalog cards; listed in sitemap.ts.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } }
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function getSet(slug: string) {
  const { data } = await supabase
    .from('sets')
    .select('id, slug, name, description, rate_per_hour, min_hours, capacity, features, photo_url, dimensions, category, accent_gradient')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return data
}

async function getGuestSurcharge(): Promise<number> {
  const { data } = await supabase.from('site_settings').select('key, value').eq('key', 'guest_surcharge_per_hour').maybeSingle()
  return data?.value != null ? Number(data.value) : 10
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const set = await getSet(params.slug)
  if (!set) return { title: 'Set not found' }
  const desc = set.description
    ? `${set.description} Book ${set.name} online at Made Kulture, Houston TX.`
    : `Rent the ${set.name} set at Made Kulture, a multi-set photography studio in Houston TX. Book online by the hour.`
  return {
    title: `${set.name} — Photography Set Rental in Houston`,
    description: desc.slice(0, 300),
    openGraph: set.photo_url ? { images: [{ url: set.photo_url }] } : undefined,
  }
}

export default async function SetLandingPage({ params }: { params: { slug: string } }) {
  const [set, surcharge] = await Promise.all([getSet(params.slug), getGuestSurcharge()])
  if (!set) notFound()

  const guestRate = Number(set.rate_per_hour) + surcharge
  const minNote = set.min_hours && set.min_hours > 1 ? `${set.min_hours}-hour minimum` : 'no minimum'
  const gradient = set.accent_gradient || 'linear-gradient(135deg, #141414 0%, #1e1e1e 100%)'

  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <SiteNav active="sets" />

      <section style={{ paddingTop: 120, paddingBottom: 60, paddingLeft: 20, paddingRight: 20 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/sets" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← ALL SETS &amp; SPACES</Link>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 2, background: 'rgba(255,255,255,0.04)', marginTop: 24 }}>
            <div style={{ position: 'relative', background: gradient, overflow: 'hidden', minHeight: 420 }}>
              {set.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={set.photo_url} alt={`${set.name} — photography set at Made Kulture, Houston`}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
              )}
            </div>

            <div style={{ background: '#0a0a0a', padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
              <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(40px, 6vw, 64px)', color: '#fff', letterSpacing: '0.02em', lineHeight: 0.95, margin: 0 }}>
                {set.name.toUpperCase()}
              </h1>
              {set.dimensions && (
                <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)' }}>{set.dimensions}</div>
              )}
              {set.description && (
                <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0 }}>{set.description}</p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>RATE</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff' }}>${guestRate}/hr · members ${set.rate_per_hour}/hr</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>BOOKING</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff' }}>{minNote} · up to {set.capacity ?? 5} people</div>
                </div>
              </div>

              {(set.features ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(set.features as string[]).map(tag => (
                    <span key={tag} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px' }}>{tag}</span>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                <Link href={`/book?type=set&set=${set.slug}`}
                  style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '14px 24px', textDecoration: 'none' }}>
                  BOOK {set.name.toUpperCase()} ↗
                </Link>
                <Link href="/tour"
                  style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '14px 24px', textDecoration: 'none' }}>
                  FREE TOUR
                </Link>
              </div>
            </div>
          </div>

          <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.7, marginTop: 24, maxWidth: 720 }}>
            {set.name} is one of nine rentable sets at Made Kulture, a shared warehouse photography and video
            studio at 4825 Gulf Freeway, Houston TX 77023. Every booking includes an Amaran 200x LED light and
            access to 180+ studio props. Open daily 9am–10pm, by appointment only.
          </p>
        </div>
      </section>
    </main>
  )
}
