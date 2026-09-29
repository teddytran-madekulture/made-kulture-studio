'use client'
import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { SETTINGS_MENU, SETTINGS_PAGES } from '@/lib/settings-sections'

// Instagram-style settings: on the settings pages a second left-hand menu opens
// beside the icon rail and the page shows one section at a time. Everywhere
// else this renders its children untouched.
export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  if (!SETTINGS_PAGES.includes(pathname)) return <>{children}</>
  return (
    <div className="st-wrap">
      <style>{`
        .st-wrap { display: flex; align-items: flex-start; }
        .st-menu { position: sticky; top: 0; flex: 0 0 300px; height: var(--vh-full, 100vh); overflow-y: auto; box-sizing: border-box; padding: 36px 20px 40px; border-right: 1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a))); }
        .st-title { font-family: Anton, 'Bebas Neue', sans-serif; font-size: 26px; letter-spacing: .02em; margin: 0 0 22px 12px; }
        .st-group { font-family: Inter; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a))); margin: 22px 0 8px 12px; }
        .st-link { display: block; padding: 11px 12px; border-radius: 9px; font-family: Inter; font-size: 14px; color: var(--t-fg); text-decoration: none; white-space: nowrap; }
        .st-link:hover { background: rgba(var(--t-fg-rgb), calc(0.06 * var(--t-a))); }
        .st-link.on { background: rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a))); font-weight: 600; }
        .st-main { flex: 1; min-width: 0; }
        .st-main .acct-content { max-width: 820px; }
        .st-main .sec-grid { flex-direction: column !important; align-items: stretch !important; }
        .st-main .sec-grid > div { max-width: 640px !important; }
        .st-main .plus-grid { grid-template-columns: minmax(0, 1fr) !important; }
        .st-main .plus-grid-pay { position: static !important; }
        @media (max-width: 768px) {
          .st-wrap { display: block; }
          .st-menu { position: static; height: auto; padding: 12px 16px; border-right: none; border-bottom: 1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a))); display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
          .st-menu::-webkit-scrollbar { display: none; }
          .st-title, .st-group { display: none; }
          .st-link { flex: 0 0 auto; padding: 8px 14px; border-radius: 999px; font-size: 13px; border: 1px solid rgba(var(--t-fg-rgb), calc(0.14 * var(--t-a))); }
          .st-link.on { background: var(--t-fg); color: var(--t-on-fg); border-color: var(--t-fg); }
        }
      `}</style>
      <aside className="st-menu" aria-label="Settings">
        <div className="st-title">SETTINGS</div>
        <Suspense fallback={<MenuLinks pathname={pathname} s={null} />}>
          <MenuWithParams pathname={pathname} />
        </Suspense>
      </aside>
      <div className="st-main">{children}</div>
    </div>
  )
}

function MenuWithParams({ pathname }: { pathname: string }) {
  const sp = useSearchParams()
  return <MenuLinks pathname={pathname} s={sp?.get('s') ?? null} />
}

function MenuLinks({ pathname, s }: { pathname: string; s: string | null }) {
  return (
    <>
      {SETTINGS_MENU.map(g => (
        <div key={g.group} style={{ display: 'contents' }}>
          <div className="st-group">{g.group}</div>
          {g.items.map(it => {
            const base = it.href.split('?')[0]
            const on = it.s ? pathname === base && (s ?? 'edit') === it.s : pathname === base
            return <Link key={it.href} href={it.href} className={`st-link${on ? ' on' : ''}`}>{it.label}</Link>
          })}
        </div>
      ))}
    </>
  )
}
