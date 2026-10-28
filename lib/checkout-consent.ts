// Checkout agreements for signed-in members (2026-10-28, migration 181).
// ⚠️ BUMP THIS when the Rental Agreement & Waiver or the guest policy changes:
// every member then sees the full, separate boxes again until they re-accept.
export const AGREEMENT_VERSION = '2026-10-28'

export const digitsOnly = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10)
