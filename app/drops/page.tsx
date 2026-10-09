import type { Metadata } from 'next'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { supabaseAdmin } from '@/lib/supabase'
import { dropPhase, runLabel, type SetDrop } from '@/lib/set-drops'

// /drops — every Set Drop people can reserve or book right now.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export const metadata: Metadata = {
  title: 'Set Drops',
  description: 'Limited-run sets at Made Kulture. Reserve one before it is built — if it happens, your deposit becomes studio credit and you book first.',
}

const anton = 'Anton, "Bebas Neue", sans-serif'
const mono = '"JetBrains Mono", ui-monospace, monospace'
const GOLD = '#c9b27e'
const LABEL: Record<string, string> = { pre_reserve: 'RESERVE NOW', deciding: 'DECIDING', early_access: 'EARLY ACCESS', open: 'NOW BOOKING' }

export default async function DropsIndex() {
  const { data } = await supabaseAdmin().from('set_drops').select('*').in('status', ['pre_reserve', 'funded']).order('run_starts', { ascending: true })
  const drops = ((data ?? []) as SetDrop[]).map(d => ({ d, phase: dropPhase(d) })).filter(x => x.phase !== 'ended')
  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="sets" />
      <header style={{ maxWidth: 1100, margin: '0 auto', padding: '140px 20px 32px' }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: GOLD, marginBottom: 14 }}>MADE KULTURE</div>
        <h1 style={{ fontFamily: anton, fontSize: 'clamp(56px, 11vw, 132px)', lineHeight: 0.9, margin: 0 }}>SET DROPS</h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, maxWidth: 620, margin: '18px 0 0' }}>
          Limited-run sets, built only if enough of you want them. Reserve one with a small deposit — if it happens, it becomes studio credit and you book before anyone else.
        </p>
      </header>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 96px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
        {drops.length === 0 && <p style={{ fontFamily: 'Inter, sans-serif', color: 'rgba(255,255,255,0.5)' }}>Nothing dropping right now. Check back soon.</p>}
        {drops.map(({ d, phase }) => (
          <Link key={d.id} href={`/drops/${d.slug}`} style={{ position: 'relative', display: 'block', aspectRatio: '4 / 5', background: '#141414', overflow: 'hidden', textDecoration: 'none', color: '#fff' }}>
            {d.hero_url && (/* eslint-disable-next-line @next/next/no-img-element */ <img src={d.hero_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }} />)}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)' }} />
            <div style={{ position: 'absolute', left: 20, right: 20, bottom: 20 }}>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: GOLD }}>{LABEL[phase] ?? ''}</div>
              <div style={{ fontFamily: anton, fontSize: 40, lineHeight: 0.95, marginTop: 6 }}>{d.name.toUpperCase()}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 8 }}>{runLabel(d)}</div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  )
}
