"use client"

// /desk/floor — the floor board with manual control.
//
// The SAME board that renders on the lock screen, but tappable: pick a room and
// mark it needs-cleaning or ready. A live staff session is the only credential
// needed here (the PIN path exists for the set tablets, which have no cookie).
//
// ⚠️ Occupancy is deliberately NOT overridable. A room is in use because a
// confirmed booking says so — a button that faked it would make the board lie
// about where guests are, which is the one thing it must never do.

import { useEffect } from 'react'
import Link from 'next/link'
import FloorBoard from '@/components/FloorBoard'

export default function DeskFloorPage() {
  // ⚠️ THE SITE'S GLOBAL CSS ZOOMS body BY 1.25, which is fatal to any
  // fixed-height layout: `height: 100vh` computed to 1215px and RENDERED at
  // 1519px, dropping Studio One and the restrooms off the bottom of a 1271px
  // window. The kiosk hits this too and solves it the same way. Cleared on
  // unmount so the rest of the desk keeps the zoom it expects.
  useEffect(() => {
    const prev = document.body.style.zoom
    document.body.style.zoom = '1'
    return () => { document.body.style.zoom = prev }
  }, [])

  return (
    <main style={{
      height: '100vh', overflow: 'hidden', color: '#fff', fontFamily: 'Inter, sans-serif',
      background: 'radial-gradient(120% 90% at 85% -10%, #191510 0%, #0d0d10 45%, #09090b 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 28px 0', flexShrink: 0 }}>
        <Link href="/desk" style={{
          display: 'inline-block', textDecoration: 'none',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)',
          color: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: '10px 20px',
          fontSize: 12, letterSpacing: '0.15em',
        }}>&larr; FRONT DESK</Link>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <FloorBoard actionable />
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: '.16em', color: 'rgba(255,255,255,.3)', padding: '0 0 14px' }}>
        TAP A ROOM TO CHANGE ITS STATUS
      </div>
    </main>
  )
}
