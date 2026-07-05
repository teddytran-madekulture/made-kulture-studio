import CatalogManager from '@/components/CatalogManager'

// Props directory — customer-facing catalog shown on /props. Managed here in
// the Website workspace (it's site content, no booking/pricing logic).
export default function WebsitePropsPage() {
  return (
    <main style={{ background: '#0b0b0d', minHeight: '100vh', color: '#f4f4f5', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 40px 0' }}>
        <CatalogManager kind="props" />
      </div>
    </main>
  )
}
