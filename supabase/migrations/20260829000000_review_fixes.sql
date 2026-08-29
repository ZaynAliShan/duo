-- ============================================================================
-- Review fixes (2026-08-29)
--  1. REPLICA IDENTITY FULL on live tables — DELETE events carry only the PK by
--     default, so Realtime can neither match the couple filter nor evaluate RLS
--     for them; the partner's screen never saw removals.
--  2. Goal completion maintained by a trigger — two simultaneous contributions
--     could each see a stale sum client-side and nobody set completed_at.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['profiles','couples','entries','hearts','pings','checkins','answers','goals',
    'goal_contributions','bucket_items','notes','list_items','facts','calendar_marks','cycles','cycle_logs','categories']
  loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- completed_at follows the real contribution sum, atomically
-- ---------------------------------------------------------------------------
create or replace function public.recompute_goal_completion(p_goal uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.goals; total numeric;
begin
  select * into g from public.goals where id = p_goal for update;
  if g.id is null then return; end if;
  select coalesce(sum(amount), 0) into total from public.goal_contributions where goal_id = p_goal;
  if total >= g.target_amount and g.completed_at is null then
    update public.goals set completed_at = now() where id = p_goal;
  elsif total < g.target_amount and g.completed_at is not null then
    update public.goals set completed_at = null where id = p_goal;
  end if;
end $$;
revoke execute on function public.recompute_goal_completion(uuid) from public, anon, authenticated;

create or replace function public.goal_contribution_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_goal_completion(coalesce(new.goal_id, old.goal_id));
  if tg_op = 'UPDATE' and new.goal_id is distinct from old.goal_id then
    perform public.recompute_goal_completion(old.goal_id);
  end if;
  return coalesce(new, old);
end $$;
create trigger goal_contribs_completion
  after insert or update or delete on public.goal_contributions
  for each row execute function public.goal_contribution_changed();

create or replace function public.goal_target_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_goal_completion(new.id);
  return new;
end $$;
-- column-specific, so the completed_at write inside recompute doesn't re-fire it
create trigger goals_target_completion
  after update of target_amount on public.goals
  for each row when (new.target_amount is distinct from old.target_amount)
  execute function public.goal_target_changed();
