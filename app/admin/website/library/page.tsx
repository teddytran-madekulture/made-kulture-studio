'use client'
// Website Editor → Library. Every website photo in one place (components/admin/MediaLibrary.tsx).
import MediaLibrary from '@/components/admin/MediaLibrary'

export default function LibraryPage() {
  return (
    <main style={{ padding: '32px 28px 60px', maxWidth: 1400, margin: '0 auto', boxSizing: 'border-box' }}>
      <MediaLibrary mode="manage" />
    </main>
  )
}
