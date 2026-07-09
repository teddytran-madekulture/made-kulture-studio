import type { Metadata } from 'next'
import JukeboxClient from './JukeboxClient'

export const metadata: Metadata = {
  title: 'Studio Jukebox — Request a Song',
  description: 'Request a song for the Made Kulture studio. The team approves requests so the vibe stays right for everyone.',
}

export const dynamic = 'force-dynamic'

export default function JukeboxPage({ searchParams }: { searchParams: { zone?: string } }) {
  return <JukeboxClient initialZone={searchParams?.zone ?? ''} />
}
