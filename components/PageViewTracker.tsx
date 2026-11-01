'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { trackPageView } from '@/lib/pageviews'

// Mounted once in app/layout.tsx. Records a view whenever the path changes.
export default function PageViewTracker() {
  const pathname = usePathname()
  useEffect(() => { if (pathname) trackPageView(pathname) }, [pathname])
  return null
}
