import { Client, Environment } from 'square'

// Verify a Square card id belongs to THIS signed-in customer before recording it
// as the card to charge on approval. Identity for a card always comes from the
// session, never from what was posted — otherwise a request body could name any
// card in the Square account. A Square outage returns false (the safe side: no
// card recorded, approval falls back to a payment link).
// Same rule as cardBelongsToSession in app/api/account/short-notice-request.
export async function cardBelongsToUser(supabase: any, userId: string, cardId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('customer_profiles').select('square_customer_id').eq('id', userId).maybeSingle()
  if (!profile?.square_customer_id) return false
  try {
    const square = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN!,
      environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
    })
    const res = await square.cardsApi.listCards(undefined, profile.square_customer_id)
    return (res.result.cards ?? []).some(c => c.id === cardId && c.enabled)
  } catch (e) {
    console.error('[card-verify] card verify failed:', e)
    return false
  }
}
