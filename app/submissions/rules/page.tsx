import type { Metadata } from 'next'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { loadActiveCalls } from '@/lib/open-calls-server'
import { centralDate } from '@/lib/open-calls'

// Official rules for Open Calls and Featured Editorial submissions (2026-10-08).
// The general rules are fixed here; each call's own dates, set and prize come
// from Admin → Open Calls, so a new call (Winter Is Coming…) needs no edit here.
// ⚠️ Not legal advice — drafted for a skill-judged contest (the studio vets and
// shortlists, members vote, the studio confirms). Have an attorney read it.

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export const metadata: Metadata = {
  title: 'Submission & Open Call Rules',
  description: 'Official rules for Made Kulture open calls and Featured Editorial submissions.',
}

const sec: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.35)' }
const body: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 15, color: 'rgba(255,255,255,0.62)', lineHeight: 1.8, margin: '0 0 16px' }

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 18 }}>
        <div style={sec}>{n} · {title.toUpperCase()}</div>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
      </div>
      {children}
    </div>
  )
}
const P = ({ children }: { children: React.ReactNode }) => <p style={body}>{children}</p>
function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ ...body, paddingLeft: 20, listStyle: 'none' }}>
      {items.map((it, i) => (
        <li key={i} style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: -18, color: 'rgba(255,255,255,0.3)' }}>—</span>{it}
        </li>
      ))}
    </ul>
  )
}
const fmt = (iso: string | null) => iso ? centralDate(iso, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : null

export default async function RulesPage() {
  const calls = (await loadActiveCalls()).filter(x => !x.c.rolling && x.c.closes_at)
  const td: React.CSSProperties = { ...body, fontSize: 13.5, margin: 0, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', verticalAlign: 'top' }

  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <SiteNav />
      <section style={{ padding: '150px 20px 40px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <Link href="/submissions" style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← SUBMISSIONS</Link>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(40px, 7vw, 72px)', color: '#fff', lineHeight: 0.95, margin: '20px 0 12px' }}>SUBMISSION &amp; OPEN CALL RULES</h1>
          <p style={{ ...body, margin: 0 }}>Last updated October 8, 2026. By submitting work you agree to these rules and to the Made Kulture <Link href="/terms" style={{ color: '#c9b27e' }}>Terms &amp; Conditions</Link>.</p>
        </div>
      </section>

      <section style={{ padding: '48px 20px 96px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>

          <Section n="01" title="Who runs it">
            <P>Open calls and Featured Editorial submissions are run by MADEKULTURE LLC (&ldquo;Made Kulture&rdquo;, &ldquo;we&rdquo;), 4825 Gulf Freeway, Houston, TX 77023. They are not sponsored, endorsed or administered by Instagram, Meta or any other platform.</P>
          </Section>

          <Section n="02" title="Two ways to submit">
            <UL items={[
              <><b style={{ color: '#fff' }}>Open calls</b> are tied to a limited-run set. They have a submission deadline, a shortlist chosen by us, a vote by directory members, and a prize. Each call&rsquo;s dates, set and prize are listed below and on its page.</>,
              <><b style={{ color: '#fff' }}>Featured Editorial</b> is always open, for work shot on any Made Kulture set. There is no deadline, vote or prize: we review submissions and may feature the ones we choose.</>,
            ]} />
          </Section>

          {calls.length > 0 && (
            <Section n="03" title="Current open calls">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Open call', 'Set', 'Submissions', 'Voting', 'Prize'].map(h => <th key={h} style={{ ...td, ...sec, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {calls.map(({ c }) => (
                      <tr key={c.id}>
                        <td style={{ ...td, color: '#fff' }}>{c.title}</td>
                        <td style={td}>{c.set_name || '—'}</td>
                        <td style={td}>{fmt(c.opens_at)} to {fmt(c.closes_at)}</td>
                        <td style={td}>{c.voting_opens_at ? `${fmt(c.voting_opens_at)} to ${fmt(c.voting_closes_at)}` : 'TBA'}</td>
                        <td style={td}>{c.prize || 'TBA'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section n="04" title="Eligibility">
            <UL items={[
              'You must be 18 or older and have a Made Kulture account in good standing.',
              'Employees and contractors of Made Kulture, and members of their households, may submit to Featured Editorial but are not eligible for open call prizes.',
              'Void where prohibited by law.',
            ]} />
          </Section>

          <Section n="05" title="How to enter an open call">
            <UL items={[
              'Shoot on the open call’s set during a session booked at Made Kulture.',
              <><b style={{ color: '#fff' }}>Teams.</b> Editorials are usually made by a team. One person submits the series on the team&rsquo;s behalf and is the entrant. The team must agree who submits before entering; if there is a disagreement later, we deal only with the person who submitted and do not decide disputes between team members.</>,
              <><b style={{ color: '#fff' }}>One series, one entry.</b> The same series, or a substantially similar edit of it, can only be entered once per open call. If team members submit it separately, we keep the earliest entry and decline the others. Deliberately entering the same work more than once can disqualify every copy.</>,
              'Submit your series, meeting the requirements below, from your account on madekulture.com/submissions before the deadline.',
              'One entry per member per open call. You can withdraw and resubmit until the deadline. Late, incomplete or corrupted entries are not accepted.',
              'Normal retouching and editing are fine. Images must be photographs made on the set; work that is mostly AI-generated, or composited from images not shot on the set, is not eligible.',
            ]} />
          </Section>

          <Section n="06" title="Submission requirements">
            <P>An entry has to meet all of these to qualify. Entries that don&rsquo;t are declined, and for an open call you can fix it and resubmit before the deadline.</P>
            <UL items={[
              <><b style={{ color: '#fff' }}>New work.</b> Open calls take work shot during that open call, on that year&rsquo;s set. Images from a previous year&rsquo;s run of a set, or anything shot before the open call opened, are not eligible. Featured Editorial takes work shot in the last 12 months. The shoot date is required.</>,
              <><b style={{ color: '#fff' }}>One series.</b> 3 to 8 images from the same shoot and concept, in the order you want them seen. Not a portfolio sampler.</>,
              <><b style={{ color: '#fff' }}>Full resolution.</b> Every image at least 2000 pixels on its longest side (JPG, PNG or HEIC). Screenshots and images saved from social media are not accepted.</>,
              <><b style={{ color: '#fff' }}>Clean frames.</b> No watermarks, logos, text overlays, borders, frames or collages.</>,
              <><b style={{ color: '#fff' }}>Finished work.</b> Edited, final images. No unedited previews or contact sheets.</>,
              <><b style={{ color: '#fff' }}>Shot here.</b> For an open call, the set must be recognisable in most of the images. Featured Editorial work must be shot on a Made Kulture set.</>,
              <><b style={{ color: '#fff' }}>Credited.</b> The photographer and everyone pictured are credited, plus anyone else who shaped the images (makeup, hair, styling, set design).</>,
              <><b style={{ color: '#fff' }}>Within the studio rules.</b> Nothing that breaks the studio rules, such as banned messy concepts or effects used without approval.</>,
            ]} />
          </Section>

          <Section n="07" title="What you promise when you submit">
            <UL items={[
              'You took the images, or you have the photographer’s permission to submit them.',
              'Everyone pictured is 18 or older, agreed to be photographed, and agreed to the images being submitted and shown as described here.',
              'Everyone you credit agreed to be credited. Credits are accurate.',
              'The work does not infringe anyone’s copyright, trademark, privacy or publicity rights, and follows the Community & Member Content rules in our Terms. Sexually explicit work is not accepted; artistic nudity must be flagged 18+ when you submit.',
              'You are responsible for any claim that these promises were not true.',
            ]} />
          </Section>

          <Section n="08" title="Review, shortlist and vote">
            <UL items={[
              'We review every entry by hand. Nothing is shown publicly unless we shortlist or feature it.',
              'After submissions close we choose a shortlist based on creativity, use of the set, technical quality and how well the series follows these rules. Our shortlist decisions are final.',
              'During the voting window, members listed in the Made Kulture directory may vote for one shortlisted series per open call and may change their vote until voting closes. Entrants may not vote for their own series. Vote counts are not shown until voting ends.',
              'We may review voting activity and remove votes we reasonably believe are fraudulent, automated, purchased, or cast from duplicate or fake accounts, and may disqualify an entry that benefits from them.',
              'The shortlisted series with the most valid votes wins, subject to verification. A tie is decided by us using the shortlist criteria above.',
            ]} />
          </Section>

          <Section n="09" title="Prize">
            <UL items={[
              'The prize for each open call is listed above and on its page. For The Patient: one 12-month Made Kulture Plus membership (approximate retail value $149) and the winning series shown as the Featured Editorial on madekulture.com and the studio kiosks. If the winner already has Plus, their membership is extended by 12 months.',
              'One prize per open call, awarded only to the member who submitted the winning series, not to each team member. The prize is not transferable and cannot be exchanged for cash. We may substitute a prize of equal or greater value if needed.',
              'Everyone credited on the winning series is named wherever it is featured, and credited members of the Made Kulture directory receive a Featured Editorial badge on their profile. The same badge goes to everyone credited on work we pick for Featured Editorial. Credits are matched by Instagram handle, so include them.',
              'We will contact the winner by email within 7 days after voting closes. If the winner doesn’t reply within 7 days, is ineligible, or can’t accept the prize, we may award it to the next eligible series.',
              'Any taxes on a prize are the winner’s responsibility.',
            ]} />
          </Section>

          <Section n="10" title="Your work and how we use it">
            <UL items={[
              'You keep the copyright in everything you submit.',
              'You give Made Kulture a non-exclusive, royalty-free license to show your submission, always with your credits: to directory members during the vote if shortlisted, and, if it is chosen or wins, on madekulture.com, the studio kiosks and screens, our social media and our emails, to promote the studio and the open call. We may resize or crop images to fit a layout but will not otherwise alter them.',
              'This license lasts while the work is shown and for archived posts afterward. You can ask us to take down featured work at any time and we will remove it from the website and kiosks within a reasonable time; posts already published to social media may remain.',
              'We will never sell your images or license them to anyone else.',
              'Entries that are not shortlisted or featured are kept private and may be deleted after the open call ends.',
            ]} />
          </Section>

          <Section n="11" title="General">
            <UL items={[
              'We may disqualify any entry or member that breaks these rules, our Terms & Conditions or our studio rules, or that tampers with the submission or voting process.',
              'If an open call can’t run as planned (for example because of fraud, technical failure or too few eligible entries), we may modify, extend, suspend or cancel it, and may award the prize among eligible entries received before the problem.',
              'Your personal information is handled under our Privacy Policy and used to run the open call, contact you and credit your work.',
              'By entering you release Made Kulture from liability for any loss or injury arising from taking part or from accepting or using a prize, except where the law does not allow this.',
              'These rules are governed by the laws of the State of Texas. Questions: email info@madekulture.com.',
            ]} />
          </Section>
        </div>
      </section>
    </main>
  )
}
