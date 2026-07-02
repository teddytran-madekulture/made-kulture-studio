'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const linkStyle: React.CSSProperties = {
  fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em',
  color: 'rgba(255,255,255,0.7)', textDecoration: 'none',
}

export default function NavAuthLink() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setAuthed(!!user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthed(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authed === null) return null // avoid flash

  if (authed) return (
    <Link
      href="/account"
      style={linkStyle}
      onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
    >
      ACCOUNT
    </Link>
  )

  return (
    <>
      <Link
        href="/login"
        style={linkStyle}
        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
      >
        LOGIN
      </Link>
      <Link
        href="/signup"
        style={{ ...linkStyle, color: '#fff' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
        onMouseLeave={e => (e.currentTarget.style.color = '#fff')}
      >
        SIGN UP
      </Link>
    </>
  )
}
