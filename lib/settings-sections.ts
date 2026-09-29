// Account settings menu (Instagram-style second menu). Profile sections live on
// /account/profile?s=<key>; the rest are their own pages.
export const PROFILE_SECTIONS = {
  edit: 'EDIT PROFILE',
  look: 'BANNER & COVER',
  portfolio: 'PORTFOLIO',
  credits: 'CREDITS & CV',
  privacy: 'DIRECTORY & NOTIFICATIONS',
} as const

export const SETTINGS_PAGES = ['/account/profile', '/account/security', '/account/payment', '/account/plus']

export const SETTINGS_MENU: { group: string; items: { href: string; label: string; s?: string }[] }[] = [
  { group: 'Your profile', items: [
    { href: '/account/profile', s: 'edit', label: 'Edit profile' },
    { href: '/account/profile?s=look', s: 'look', label: 'Banner & cover' },
    { href: '/account/profile?s=portfolio', s: 'portfolio', label: 'Portfolio' },
    { href: '/account/profile?s=credits', s: 'credits', label: 'Credits & CV' },
    { href: '/account/profile?s=privacy', s: 'privacy', label: 'Directory & notifications' },
  ] },
  { group: 'Your account', items: [
    { href: '/account/security', label: 'Login & security' },
    { href: '/account/payment', label: 'Payment methods' },
    { href: '/account/plus', label: 'Membership' },
  ] },
]
