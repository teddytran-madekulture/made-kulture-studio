// ── Front-desk staff roles & permissions ──────────────────────────────────────
// Single source of truth for what each role can do. Enforced SERVER-SIDE in every
// staff API route; the UI also reads `can()` to hide controls, but that's cosmetic.

export type StaffRole = 'front_desk' | 'manager' | 'owner'

export const STAFF_ROLES: StaffRole[] = ['front_desk', 'manager', 'owner']

export const ROLE_LABELS: Record<StaffRole, string> = {
  front_desk: 'Front Desk',
  manager: 'Manager',
  owner: 'Owner',
}

// Permission → roles that hold it.
export const PERMISSIONS = {
  'booking.view':     ['front_desk', 'manager', 'owner'],
  'booking.checkin':  ['front_desk', 'manager', 'owner'],
  'booking.create':   ['front_desk', 'manager', 'owner'],
  'booking.modify':   ['front_desk', 'manager', 'owner'],
  'booking.cancel':   ['front_desk', 'manager', 'owner'],
  'addon.add':        ['front_desk', 'manager', 'owner'],
  'payment.terminal': ['front_desk', 'manager', 'owner'],
  'payment.refund':   ['manager', 'owner'],          // money out — gated
  'payment.overage':  ['manager', 'owner'],          // gated
  'staff.manage':     ['owner'],
  'audit.view':       ['owner'],
  'settings.edit':    ['owner'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function can(role: StaffRole, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly string[]).includes(role)
}
