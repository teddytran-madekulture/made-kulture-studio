import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/admin/customers/merge
// Body: { primaryId: string, duplicateIds: string[] }
// Reassigns all bookings + notes from duplicates to primary, merges fields, deletes duplicates
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { primaryId, duplicateIds } = await req.json()
  if (!primaryId || !Array.isArray(duplicateIds) || duplicateIds.length === 0) {
    return NextResponse.json({ error: 'primaryId and duplicateIds[] required' }, { status: 400 })
  }

  // Fetch primary + all duplicates
  const allIds = [primaryId, ...duplicateIds]
  const { data: customers, error: fetchError } = await supabase
    .from('customers')
    .select('id, name, email, phone, status, banned, pricing_overrides, square_customer_id, acuity_client_id, alt_emails, alt_phones, alt_names')
    .in('id', allIds)

  if (fetchError || !customers) {
    return NextResponse.json({ error: fetchError?.message ?? 'Customers not found' }, { status: 404 })
  }

  const primary = customers.find(c => c.id === primaryId)
  if (!primary) return NextResponse.json({ error: 'Primary customer not found' }, { status: 404 })

  const duplicates = customers.filter(c => c.id !== primaryId)

  // Build merged field values: prefer primary's data, fill blanks from duplicates
  let mergedName             = primary.name
  let mergedPhone            = primary.phone
  let mergedStatus           = primary.status ?? 'regular'
  let mergedSquareCustomerId = primary.square_customer_id
  let mergedAcuityClientId   = primary.acuity_client_id
  let mergedPricingOverrides = primary.pricing_overrides

  // Collect every email/phone that differs from the primary so none is lost.
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const altEmails = new Set<string>((primary.alt_emails ?? []).map((e: string) => e.trim()).filter(Boolean))
  const altPhones = new Set<string>((primary.alt_phones ?? []).map((p: string) => p.trim()).filter(Boolean))
  const altNames  = new Set<string>((primary.alt_names  ?? []).map((n: string) => n.trim()).filter(Boolean))

  for (const dup of duplicates) {
    if (!mergedName  && dup.name)  mergedName  = dup.name
    if (!mergedPhone && dup.phone) mergedPhone = dup.phone
    if (mergedStatus === 'regular' && dup.status && dup.status !== 'regular') mergedStatus = dup.status
    if (!mergedSquareCustomerId && dup.square_customer_id) mergedSquareCustomerId = dup.square_customer_id
    if (!mergedAcuityClientId  && dup.acuity_client_id)  mergedAcuityClientId  = dup.acuity_client_id
    if (!mergedPricingOverrides && dup.pricing_overrides) mergedPricingOverrides = dup.pricing_overrides

    // Preserve the duplicate's contact info + name (and any alternates it had).
    if (dup.email && norm(dup.email) !== norm(primary.email)) altEmails.add(dup.email.trim())
    for (const e of (dup.alt_emails ?? [])) if (e?.trim()) altEmails.add(e.trim())
    if (dup.phone && norm(dup.phone) !== norm(primary.phone)) altPhones.add(dup.phone.trim())
    for (const p of (dup.alt_phones ?? [])) if (p?.trim()) altPhones.add(p.trim())
    if (dup.name && norm(dup.name) !== norm(primary.name)) altNames.add(dup.name.trim())
    for (const n of (dup.alt_names ?? [])) if (n?.trim()) altNames.add(n.trim())
  }

  // Don't duplicate the primary's own current values in the alt lists.
  const mergedAltEmails = Array.from(altEmails).filter(e => norm(e) !== norm(primary.email))
  const mergedAltPhones = Array.from(altPhones).filter(p => norm(p) !== norm(mergedPhone))
  const mergedAltNames  = Array.from(altNames).filter(n => norm(n) !== norm(mergedName))

  const errors: string[] = []

  // 1. Reassign bookings
  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({ customer_id: primaryId })
    .in('customer_id', duplicateIds)

  if (bookingErr) errors.push(`bookings: ${bookingErr.message}`)

  // 2. Reassign notes
  const { error: notesErr } = await supabase
    .from('customer_notes')
    .update({ customer_id: primaryId })
    .in('customer_id', duplicateIds)

  if (notesErr) errors.push(`notes: ${notesErr.message}`)

  // 3. Update primary with merged fields
  const { error: updateErr } = await supabase
    .from('customers')
    .update({
      name:               mergedName,
      phone:              mergedPhone,
      status:             mergedStatus,
      square_customer_id: mergedSquareCustomerId,
      acuity_client_id:   mergedAcuityClientId,
      pricing_overrides:  mergedPricingOverrides,
      alt_emails:         mergedAltEmails,
      alt_phones:         mergedAltPhones,
      alt_names:          mergedAltNames,
    })
    .eq('id', primaryId)

  if (updateErr) errors.push(`update primary: ${updateErr.message}`)

  // 4. Delete duplicates
  const { error: deleteErr } = await supabase
    .from('customers')
    .delete()
    .in('id', duplicateIds)

  if (deleteErr) errors.push(`delete duplicates: ${deleteErr.message}`)

  return NextResponse.json({
    success: errors.length === 0,
    mergedCount: duplicateIds.length,
    primaryId,
    errors,
  })
}
