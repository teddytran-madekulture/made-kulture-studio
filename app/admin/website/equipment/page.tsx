import CatalogManager from '@/components/CatalogManager'

// Equipment catalog — customer-facing gear shown on /gear. Managed here in the
// Website workspace (it's site content); rental pricing still applies at booking.
export default function WebsiteEquipmentPage() {
  return (
    <main style={{ background: '#0b0b0d', minHeight: '100vh', color: '#f4f4f5', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 40px 0' }}>
        <CatalogManager kind="equipment" />
      </div>
    </main>
  )
}
