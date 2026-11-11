import SetsCatalogManager, { type StudioField } from '@/components/SetsCatalogManager'
import { getContentPage } from '@/lib/site-content'

// Sets catalog — customer-facing set photos, galleries, and copy. Managed here in
// the Website workspace alongside Props and Equipment. Booking/pricing fields for
// each set stay in the dashboard's Products & Pricing screen.
//
// 2026-11-10: the full warehouse is not a `sets` row, so it never had a card here.
// Its editable copy lives in site_content (Sets page "Full studio takeover" fields
// + the Book flow prep question). We hand those field definitions (with their
// defaults) to the manager so it can show a FULL STUDIO card that edits them —
// same page, same feel as the sets, no second place to look.
const STUDIO_KEYS: [string, string][] = [
  ['book', 'studioBookingPrompt'],
  ['sets', 'buyoutDesc'],
  ['sets', 'buyoutIncludes'],
  ['sets', 'buyoutCapacity'],
  ['sets', 'buyoutSqft'],
  ['sets', 'buyoutTags'],
]

export default function WebsiteSetsPage() {
  const studioFields: StudioField[] = STUDIO_KEYS.flatMap(([page, key]) => {
    const f = getContentPage(page)?.fields.find(x => x.key === key)
    return f ? [{ page, key, label: f.label, type: f.type === 'multiline' ? 'multiline' as const : 'text' as const, default: f.default ?? '', hint: f.hint }] : []
  })
  return (
    <main style={{ background: '#0b0b0d', minHeight: 'var(--vh-full)', color: '#f4f4f5', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 40px 0' }}>
        <SetsCatalogManager studioFields={studioFields} />
      </div>
    </main>
  )
}
