import { NextRequest, NextResponse } from 'next/server'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/pg_meta/v0/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      query: `create table if not exists email_templates (
        key         text primary key,
        enabled     boolean not null default true,
        subject     text,
        updated_at  timestamptz default now()
      );`
    })
  })

  const data = await res.json().catch(() => ({}))
  return NextResponse.json({ status: res.status, data })
}
