import SetsCatalogManager from '@/components/SetsCatalogManager'

// Sets catalog — customer-facing set photos, galleries, and copy. Managed here in
// the Website workspace alongside Props and Equipment. Booking/pricing fields for
// each set stay in the dashboard's Products & Pricing screen.
export default function WebsiteSetsPage() {
  return (
    <main style={{ background: '#0b0b0d', minHeight: '100vh', color: '#f4f4f5', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 40px 0' }}>
        <SetsCatalogManager />
      </div>
    </main>
  )
}
