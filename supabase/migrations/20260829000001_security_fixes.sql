-- ============================================================================
-- Security review fixes (2026-08-29)
--  1. Blur/reveal helpers must be scoped to the CURRENT couple: a stale check-in
--     or answer from a previous couple must never unlock a new partner's private
--     row/photo — and (couple_id, user_id, day) uniqueness lets a person check in
--     on a date they had already used in an old couple.
--  2. Check-ins and answers can no longer be deleted: insert → peek → delete
--     defeated the mutual-reveal promise. (They stay editable.)
--  3. invite_preview no longer distinguishes unknown/used/expired/full to anon —
--     one opaque "invalid" kills the enumeration oracle.
--  4. Internal helpers are not anon-callable RPCs; shares_cycle only answers
--     about your own couple.
--  5. Shared tables that record an actor pin that column to auth.uid() on insert.
-- ============================================================================

-- (1) couple-scoped reveal helpers
create or replace function public.has_checked_in(d date)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from public.checkins c
                 where c.user_id = auth.uid() and c.day = d
                   and c.couple_id = public.current_couple_id());
end $$;

create or replace function public.has_answered(d date)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from public.answers a
                 where a.user_id = auth.uid() and a.day = d
                   and a.couple_id = public.current_couple_id());
end $$;

alter table public.checkins drop constraint checkins_user_id_day_key;
alter table public.checkins add constraint checkins_couple_user_day_key unique (couple_id, user_id, day);
alter table public.answers drop constraint answers_user_id_day_key;
alter table public.answers add constraint answers_couple_user_day_key unique (couple_id, user_id, day);

-- (2) no deleting a posted check-in or answer
drop policy checkins_delete on public.checkins;
drop policy answers_delete on public.answers;

-- (3) opaque invite preview — valid gets the inviter's name, everything else is just "invalid"
create or replace function public.invite_preview(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare inv public.invites; inviter text; members int;
begin
  select * into inv from public.invites i where i.code = upper(trim(p_code));
  if inv.code is null or inv.used_at is not null or inv.expires_at < now() then
    return json_build_object('ok', false);
  end if;
  select count(*) into members from public.profiles where couple_id = inv.couple_id;
  if members >= 2 then return json_build_object('ok', false); end if;
  select display_name into inviter from public.profiles where id = inv.created_by;
  return json_build_object('ok', true, 'inviter', coalesce(nullif(inviter, ''), 'Someone'));
end $$;

-- (4) helpers are for RLS policies (authenticated), never anon RPCs
revoke execute on function public.current_couple_id() from anon;
revoke execute on function public.has_checked_in(date) from anon;
revoke execute on function public.has_answered(date) from anon;
revoke execute on function public.shares_cycle(uuid) from anon;
revoke execute on function public.storage_day(text) from anon;
revoke execute on function public.couple_today() from anon;

create or replace function public.shares_cycle(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select cycle_shared from public.profiles
                   where id = uid and couple_id = public.current_couple_id()), false)
$$;

-- (5) actor columns can't be forged onto the partner
drop policy list_items_insert on public.list_items;
create policy list_items_insert on public.list_items for insert to authenticated
  with check (couple_id = public.current_couple_id() and added_by = auth.uid());
drop policy bucket_items_insert on public.bucket_items;
create policy bucket_items_insert on public.bucket_items for insert to authenticated
  with check (couple_id = public.current_couple_id() and added_by = auth.uid());
drop policy calendar_marks_insert on public.calendar_marks;
create policy calendar_marks_insert on public.calendar_marks for insert to authenticated
  with check (couple_id = public.current_couple_id() and (created_by is null or created_by = auth.uid()));
