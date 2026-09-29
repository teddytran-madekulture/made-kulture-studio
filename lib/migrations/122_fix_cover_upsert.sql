-- ============================================
-- Migration 122 — fix: saving the profile wiped a Founding member's cover photo
-- ============================================
-- /api/account/profile saves with UPSERT (insert … on conflict do update).
-- Postgres fires the BEFORE INSERT trigger first, on the proposed row — which
-- never carries founding_number — so migration 121's rule "no founding number
-- ⇒ no cover" nulled cover_url, and the conflict UPDATE then wrote that null.
-- Fix: when the INSERT is really an upsert onto an existing row, leave the row
-- alone and let the BEFORE UPDATE pass (which sees the real founding_number)
-- enforce the rules.

create or replace function guard_founding_columns()
  returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and exists (select 1 from customer_profiles where id = new.id) then
    return new; -- upsert onto an existing row: the UPDATE pass guards it
  end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.founding_number := null; new.founding_blocked := false; new.founding_at := null;
    else
      new.founding_number := old.founding_number; new.founding_blocked := old.founding_blocked; new.founding_at := old.founding_at;
    end if;
  end if;
  if new.founding_number is null then new.cover_url := null; end if;
  return new;
end $$;
