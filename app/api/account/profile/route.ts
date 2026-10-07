import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { colorByKey } from '@/lib/profile-colors'
import { cleanCredits } from '@/lib/profile-credits'
import { cleanIgHandle } from '@/lib/directory-listing'
import { phone10, sendPhoneCode, checkPhoneCode } from '@/lib/phone-verify'

// Service role client — needed to read the customers table (RLS restricts to service_role only)
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch custom pricing overrides using service role (customers table is service_role only)
  const { data: custData } = await serviceSupabase
    .from('customers')
    .select('pricing_overrides, phone')
    .eq('email', user.email!.toLowerCase())
    .maybeSingle()

  return NextResponse.json({
    profile: { ...data, email: user.email },
    pricingOverrides: custData?.pricing_overrides ?? null,
    // 2026-10-04: checkout prefill. A profile phone can be blank (Google
    // sign-ups, accounts made before phone was asked) while the customer
    // record from their bookings has one. Checkout falls back to it; the
    // profile itself is untouched.
    bookingPhone: data?.phone || custData?.phone || null,
  })
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { full_name, phone, instagram, sms_opt_in, roles, directory_opt_in, avatar_url } = body

  // A pasted Instagram URL is stored as the bare handle (lib/directory-listing).
  const igClean = typeof instagram === 'string' ? (cleanIgHandle(instagram) || null) : instagram
  // ── Identity fields: name, phone, Instagram (2026-10-07) ──────────────────
  // These can only be written by the service role (migration 147 trigger), so
  // they're checked here and saved separately below — never in the user-scoped
  // upsert, where the trigger would silently keep the old values.
  //   phone      — changing an existing number needs a 6-digit code texted to
  //                the new one (lib/phone-verify). First-time numbers don't.
  //   name / IG  — directory members (opted in, or a creative/vendor/brand
  //                account) can change each once every 30 days.
  //   every change lands in profile_change_log for the admin.
  const { data: cur } = await serviceSupabase.from('customer_profiles')
    .select('full_name, phone, instagram, name_changed_at, instagram_changed_at, directory_opt_in, account_type')
    .eq('id', user.id).maybeSingle()
  const identity: Record<string, unknown> = {}
  const changes: { field: string; old_value: string | null; new_value: string | null }[] = []
  const COOLDOWN_MS = 30 * 86_400_000
  const coolingFor = !!cur && (cur.directory_opt_in || (cur.account_type && cur.account_type !== 'customer'))
  const nextAllowed = (at: string | null) => {
    if (!coolingFor || !at) return null
    const t = Date.parse(at) + COOLDOWN_MS
    return t > Date.now() ? new Date(t).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric' }) : null
  }

  if (typeof full_name === 'string' && cur) {
    const next = full_name.trim().slice(0, 80)
    const prev = (cur.full_name ?? '').trim()
    if (next !== prev) {
      if (!next) return NextResponse.json({ error: 'Your name can’t be blank.' }, { status: 400 })
      const wait = prev ? nextAllowed(cur.name_changed_at) : null
      if (wait) return NextResponse.json({ error: `Names can be changed once every 30 days. You can change yours again on ${wait}.`, field: 'full_name' }, { status: 429 })
      identity.full_name = next
      if (prev) identity.name_changed_at = new Date().toISOString()
      changes.push({ field: 'full_name', old_value: prev || null, new_value: next })
    }
  }

  if (instagram !== undefined && cur) {
    const next = (igClean as string | null) || null
    const prev = cur.instagram || null
    if ((next ?? '') !== (prev ?? '')) {
      const wait = prev ? nextAllowed(cur.instagram_changed_at) : null
      if (wait) return NextResponse.json({ error: `Instagram can be changed once every 30 days. You can change yours again on ${wait}.`, field: 'instagram' }, { status: 429 })
      identity.instagram = next
      if (prev) identity.instagram_changed_at = new Date().toISOString()
      changes.push({ field: 'instagram', old_value: prev, new_value: next })
    }
  }

  if (typeof phone === 'string' && cur) {
    const prevDigits = phone10(cur.phone)
    const raw = phone.trim()
    const nextDigits = phone10(raw)
    if (!raw) {
      if (prevDigits) return NextResponse.json({ error: 'A phone number is required.', field: 'phone' }, { status: 400 })
    } else if (!nextDigits) {
      return NextResponse.json({ error: 'Enter a 10-digit phone number.', field: 'phone' }, { status: 400 })
    } else if (nextDigits !== prevDigits) {
      if (prevDigits) {
        const code = typeof body.phone_code === 'string' ? body.phone_code.trim() : ''
        if (!code) {
          const sent = await sendPhoneCode(user.id, nextDigits)
          if (!sent.ok) return NextResponse.json({ error: sent.error, field: 'phone' }, { status: 400 })
          return NextResponse.json({ needsPhoneCode: true, sentTo: nextDigits.slice(-4) }, { status: 409 })
        }
        const ok = await checkPhoneCode(user.id, nextDigits, code)
        if (!ok.ok) return NextResponse.json({ error: ok.error, needsPhoneCode: true, field: 'phone' }, { status: 400 })
      }
      identity.phone = nextDigits
      changes.push({ field: 'phone', old_value: prevDigits, new_value: nextDigits })
    }
  }

  // No profile row yet (shouldn't happen — signup creates one): insert them directly.
  const patch: Record<string, unknown> = cur
    ? { id: user.id, sms_opt_in }
    : { id: user.id, full_name, phone: phone10(phone) ?? phone, instagram: igClean, sms_opt_in }
  if (Array.isArray(roles)) patch.roles = roles.map((r: unknown) => String(r)).filter(Boolean)
  if (typeof directory_opt_in === 'boolean') patch.directory_opt_in = directory_opt_in
  if (typeof avatar_url === 'string') patch.avatar_url = avatar_url
  if (typeof body.onboarded === 'boolean') patch.onboarded = body.onboarded
  if (typeof body.bio === 'string') patch.bio = body.bio.slice(0, 600)
  if (typeof body.video_url === 'string') patch.video_url = body.video_url.slice(0, 300)
  if (typeof body.show_email === 'boolean') patch.show_email = body.show_email
  if (typeof body.show_phone === 'boolean') patch.show_phone = body.show_phone
  if (['customer', 'creative', 'vendor', 'brand'].includes(body.account_type)) patch.account_type = body.account_type
  if (typeof body.notify_email === 'boolean') patch.notify_email = body.notify_email
  if (typeof body.notify_sms === 'boolean') patch.notify_sms = body.notify_sms
  // Credits + CV (migration 123).
  if (Array.isArray(body.credits)) patch.credits = cleanCredits(body.credits)
  if (typeof body.cv_url === 'string') {
    const cv = body.cv_url.trim().slice(0, 500)
    // Only accept a PDF in this member's own storage folder (or '' to remove).
    patch.cv_url = cv && cv.includes(`/avatars/${user.id}/`) ? cv : null
  }
  // Banner color: a palette key or '' to clear (migration 121).
  if (typeof body.profile_color === 'string') patch.profile_color = colorByKey(body.profile_color) ? body.profile_color : null
  // Cover photo: Founding Creatives only (the DB trigger enforces this too).
  if (typeof body.cover_url === 'string') {
    const { data: f } = await serviceSupabase.from('customer_profiles').select('founding_number').eq('id', user.id).maybeSingle()
    if (f?.founding_number) patch.cover_url = body.cover_url.trim().slice(0, 500) || null
  }
  if (Array.isArray(body.links)) {
    patch.links = body.links
      .filter((l: unknown): l is { label?: unknown; url?: unknown } =>
        !!l && typeof (l as { url?: unknown }).url === 'string' && String((l as { url: string }).url).trim() !== '')
      .slice(0, 8)
      .map((l: { label?: unknown; url?: unknown }) => ({
        label: String(l.label ?? '').slice(0, 40),
        url: String(l.url).slice(0, 300),
      }))
  }

  const { data, error } = await supabase
    .from('customer_profiles')
    .upsert(patch)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Object.keys(identity).length) {
    const { data: upd, error: idErr } = await serviceSupabase.from('customer_profiles')
      .update(identity).eq('id', user.id).select().single()
    if (idErr || !upd) {
      console.error('[profile] identity update failed:', idErr)
      return NextResponse.json({ error: 'Your other changes saved, but your name, phone or Instagram didn’t. Please try again.' }, { status: 500 })
    }
    if (changes.length) {
      const { error: logErr } = await serviceSupabase.from('profile_change_log').insert(changes.map(c => ({ ...c, user_id: user.id })))
      if (logErr) console.error('[profile] change log insert failed:', logErr.message)
    }
    return NextResponse.json({ profile: upd })
  }
  return NextResponse.json({ profile: data })
}
