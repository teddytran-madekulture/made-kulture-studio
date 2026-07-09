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


/**
 * Returns true for tablet-width viewports (769-1023px) - between phone and
 * desktop. Lets marketing grids drop from 5 columns to 3 on tablets.
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px) and (max-width: 1023px)')
    const update = () => setIsTablet(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isTablet
}
