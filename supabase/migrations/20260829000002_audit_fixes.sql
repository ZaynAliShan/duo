-- ============================================================================
-- Audit fixes (errors-v1.md, 2026-08-29)
--  G1/N2/F2/F3  child rows must point at parents INSIDE the caller's couple
--               (goal_contributions.goal_id, hearts.entry_id, list_items.note_id,
--                notes.goal_id, facts.about_profile_id, entries.category_id)
--  G1           recompute_goal_completion sums only the goal's own couple
--  I1           invite codes: 10 chars (50 bits), 48 h TTL, no inviter name for anon
--  I4           seed_person_facts is idempotent; lifecycle RPCs not anon-callable
--  T2           checkin_streaks(): partner's streak computed server-side (RLS hides
--               the rows the client would need)
--  U4           categories.monthly_cap can't be negative
-- ============================================================================

-- ---------------------------------------------------------------------------
-- helpers: "is this parent row in my couple?"
-- ---------------------------------------------------------------------------
create or replace function public.goal_in_couple(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select g is null or exists (select 1 from public.goals where id = g and couple_id = public.current_couple_id())
$$;
create or replace function public.entry_in_couple(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entries where id = e and couple_id = public.current_couple_id())
$$;
create or replace function public.note_in_couple(n uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.notes where id = n and couple_id = public.current_couple_id())
$$;
create or replace function public.category_in_couple(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select c is null or exists (select 1 from public.categories where id = c and couple_id = public.current_couple_id())
$$;
create or replace function public.profile_in_couple(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p is null or exists (select 1 from public.profiles where id = p and couple_id is not null and couple_id = public.current_couple_id())
$$;
revoke execute on function public.goal_in_couple(uuid), public.entry_in_couple(uuid), public.note_in_couple(uuid),
  public.category_in_couple(uuid), public.profile_in_couple(uuid) from anon;

-- goal_contributions
drop policy gc_insert on public.goal_contributions;
create policy gc_insert on public.goal_contributions for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid() and public.goal_in_couple(goal_id));
drop policy gc_update on public.goal_contributions;
create policy gc_update on public.goal_contributions for update to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid())
  with check (couple_id = public.current_couple_id() and user_id = auth.uid() and public.goal_in_couple(goal_id));

-- hearts
drop policy hearts_insert on public.hearts;
create policy hearts_insert on public.hearts for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid() and public.entry_in_couple(entry_id));

-- list_items
drop policy list_items_insert on public.list_items;
create policy list_items_insert on public.list_items for insert to authenticated
  with check (couple_id = public.current_couple_id() and added_by = auth.uid() and public.note_in_couple(note_id));
drop policy list_items_update on public.list_items;
create policy list_items_update on public.list_items for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id() and public.note_in_couple(note_id));

-- notes (goal pin)
drop policy notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid() and public.goal_in_couple(goal_id));
drop policy notes_update on public.notes;
create policy notes_update on public.notes for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id() and public.goal_in_couple(goal_id));

-- facts (about_profile_id)
drop policy facts_insert on public.facts;
create policy facts_insert on public.facts for insert to authenticated
  with check (couple_id = public.current_couple_id() and public.profile_in_couple(about_profile_id));
drop policy facts_update on public.facts;
create policy facts_update on public.facts for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id() and public.profile_in_couple(about_profile_id));

-- entries (category_id)
drop policy entries_insert on public.entries;
create policy entries_insert on public.entries for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid() and public.category_in_couple(category_id));
drop policy entries_update on public.entries;
create policy entries_update on public.entries for update to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid())
  with check (couple_id = public.current_couple_id() and user_id = auth.uid() and public.category_in_couple(category_id));

-- ---------------------------------------------------------------------------
-- G1: completion only ever counts the goal's own couple
-- ---------------------------------------------------------------------------
create or replace function public.recompute_goal_completion(p_goal uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.goals; total numeric;
begin
  select * into g from public.goals where id = p_goal for update;
  if g.id is null then return; end if;
  select coalesce(sum(amount), 0) into total from public.goal_contributions where goal_id = p_goal and couple_id = g.couple_id;
  if total >= g.target_amount and g.completed_at is null then
    update public.goals set completed_at = now() where id = p_goal;
  elsif total < g.target_amount and g.completed_at is not null then
    update public.goals set completed_at = null where id = p_goal;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- I1: invites — 10-char codes, 48 h, opaque to anon
-- ---------------------------------------------------------------------------
create or replace function public.gen_invite_code()
returns text language plpgsql as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_code text; i int;
begin
  loop
    v_code := '';
    for i in 1..10 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invites where invites.code = v_code);
  end loop;
  return v_code;
end $$;
alter table public.invites alter column expires_at set default now() + interval '48 hours';
-- anyone holding an old 7-day code keeps it only for the shorter window
update public.invites set expires_at = least(expires_at, created_at + interval '48 hours') where used_at is null;

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
  -- the inviter's name is only for someone who is signed in (no free name-harvesting by code guessing)
  if auth.uid() is null then return json_build_object('ok', true); end if;
  select display_name into inviter from public.profiles where id = inv.created_by;
  return json_build_object('ok', true, 'inviter', coalesce(nullif(inviter, ''), 'Someone'));
end $$;

-- ---------------------------------------------------------------------------
-- I4: idempotent scaffold facts; lifecycle RPCs need a session
-- ---------------------------------------------------------------------------
create or replace function public.seed_person_facts(p_couple uuid, p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.facts where couple_id = p_couple and about_profile_id = p_profile) then return; end if;
  insert into public.facts (couple_id, about_profile_id, section, emoji, label, sort) values
    (p_couple, p_profile, 'dates', '🎂', 'Birthday', 0),
    (p_couple, p_profile, 'favs',  '☕', 'Coffee/tea order', 0),
    (p_couple, p_profile, 'favs',  '🌈', 'Color', 1),
    (p_couple, p_profile, 'favs',  '🍲', 'Comfort food', 2),
    (p_couple, p_profile, 'favs',  '💕', 'Love languages', 3),
    (p_couple, p_profile, 'favs',  '🥨', 'Snacks', 4),
    (p_couple, p_profile, 'other', '🤧', 'Allergies', 0),
    (p_couple, p_profile, 'other', '👖', 'Clothing sizes', 1),
    (p_couple, p_profile, 'other', '👟', 'Shoe size', 2);
end $$;


-- ---------------------------------------------------------------------------
-- T2: check-in streaks for both members, computed where all rows are visible
-- ---------------------------------------------------------------------------
create or replace function public.checkin_streaks()
returns table (user_id uuid, streak int) language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.current_couple_id(); t date := public.couple_today(); m record; d date; n int;
begin
  if c is null then return; end if;
  for m in select p.id from public.profiles p where p.couple_id = c loop
    n := 0;
    d := case when exists (select 1 from public.checkins x where x.couple_id = c and x.user_id = m.id and x.day = t) then t else t - 1 end;
    while exists (select 1 from public.checkins x where x.couple_id = c and x.user_id = m.id and x.day = d) loop
      n := n + 1; d := d - 1;
    end loop;
    user_id := m.id; streak := n; return next;
  end loop;
end $$;
revoke execute on function public.checkin_streaks() from anon;

-- ---------------------------------------------------------------------------
-- U4: soft caps are never negative
-- ---------------------------------------------------------------------------
update public.categories set monthly_cap = null where monthly_cap < 0;
alter table public.categories add constraint categories_cap_nonneg check (monthly_cap is null or monthly_cap >= 0);

-- ---------------------------------------------------------------------------
-- Function privileges (last: every function referenced below must already exist)
-- ---------------------------------------------------------------------------
-- NB: `revoke … from anon` alone does nothing while PUBLIC still holds EXECUTE (Postgres' default for new
-- functions) — anon inherits it. Strip PUBLIC, then grant back only to the roles that need it.
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_couple()', 'public.create_invite()', 'public.redeem_invite(text)', 'public.leave_couple()',
    'public.delete_account()', 'public.couple_members()', 'public.current_couple_id()', 'public.has_checked_in(date)',
    'public.has_answered(date)', 'public.shares_cycle(uuid)', 'public.storage_day(text)', 'public.couple_today()',
    'public.checkin_streaks()', 'public.goal_in_couple(uuid)', 'public.entry_in_couple(uuid)', 'public.note_in_couple(uuid)',
    'public.category_in_couple(uuid)', 'public.profile_in_couple(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  -- the storage-policy helpers also run as the storage service's roles
  foreach f in array array['public.current_couple_id()', 'public.has_checked_in(date)', 'public.storage_day(text)']
  loop execute format('grant execute on function %s to authenticated, service_role, supabase_storage_admin', f); end loop;
  -- the only RPC a stranger may call, on purpose: the (opaque) invite preview
  execute 'revoke execute on function public.invite_preview(text) from public';
  execute 'grant execute on function public.invite_preview(text) to anon, authenticated, service_role';
end $$;
