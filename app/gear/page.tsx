import type { Metadata } from 'next'
import GearClient from './GearClient'
import { getPageContent } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Equipment Rental — Lighting, Camera & Effects',
  description: 'Rent Aputure and Profoto lighting, a Canon R5, haze machines, and more — in-studio with your session at Made Kulture Houston.',
}

// Server wrapper: fetch editable copy (Website workspace) and render the
// client page. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function GearPage() {
  const content = await getPageContent('gear')
  return <GearClient content={content} />
}
