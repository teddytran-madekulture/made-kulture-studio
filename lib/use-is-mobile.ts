'use client'
import { useState, useEffect } from 'react'

/**
 * Returns true when the viewport is at or below `breakpoint` px wide.
 * Lets inline-styled components branch their layout for phones (inline styles
 * can't use CSS media queries). SSR-safe: renders desktop first, then corrects
 * on mount.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpoint])

  return isMobile
}
