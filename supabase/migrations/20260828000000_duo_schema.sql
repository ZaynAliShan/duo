-- ============================================================================
-- Duo 💛 — full schema, RLS, lifecycle functions (plan §2–§3, built once: P0.4)
-- ============================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- couples (created first: profiles point at it)
-- ---------------------------------------------------------------------------
create table public.couples (
  id              uuid primary key default gen_random_uuid(),
  together_since  date,
  anniversary     date,
  timezone        text not null default 'Asia/Karachi',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — one per auth user, created by trigger
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null default '',
  avatar_color   text not null default '#E8846B',
  avatar_url     text,
  couple_id      uuid references public.couples(id) on delete set null,
  cycle_shared   boolean not null default false,
  theme          text not null default 'light',
  created_at     timestamptz not null default now()
);
create index profiles_couple_idx on public.profiles(couple_id);

-- ---------------------------------------------------------------------------
-- helpers (SECURITY DEFINER + STABLE so policies can use them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.current_couple_id()
returns uuid language sql stable security definer set search_path = public as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

create or replace function public.has_checked_in(d date)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return exists (select 1 from public.checkins c where c.user_id = auth.uid() and c.day = d); end $$;

create or replace function public.has_answered(d date)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return exists (select 1 from public.answers a where a.user_id = auth.uid() and a.day = d); end $$;

create or replace function public.shares_cycle(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select cycle_shared from public.profiles where id = uid), false)
$$;

create or replace function public.couple_today()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.couples where id = public.current_couple_id()), 'Asia/Karachi'))::date
$$;

-- generic updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- auth → profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- profiles.couple_id is never client-writable; the 2-member cap lives here too
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare members int;
begin
  if new.couple_id is distinct from old.couple_id then
    if coalesce(current_setting('duo.lifecycle', true), '') <> 'on' then
      raise exception 'couple_id can only change through Duo''s lifecycle functions';
    end if;
    if new.couple_id is not null then
      select count(*) into members from public.profiles where couple_id = new.couple_id and id <> new.id;
      if members >= 2 then
        raise exception 'this Duo already has two people in it';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------
create table public.invites (
  code        text primary key,
  couple_id   uuid not null references public.couples(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '7 days',
  used_by     uuid references auth.users(id) on delete set null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index invites_couple_idx on public.invites(couple_id);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  name         text not null,
  emoji        text not null default '🌀',
  color        text not null default '#EDE7DE',
  sort         int  not null default 0,
  monthly_cap  numeric(12,2),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index categories_couple_idx on public.categories(couple_id);

-- ---------------------------------------------------------------------------
-- entries — the feed (expenses + moments)
-- ---------------------------------------------------------------------------
create table public.entries (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('expense','moment')),
  amount        numeric(12,2) check (amount is null or amount >= 0),
  category_id   uuid references public.categories(id) on delete set null,
  moment_tag    text,
  moment_emoji  text,
  note          text not null default '',
  photo_path    text,
  happened_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint entries_expense_amount check (kind <> 'expense' or amount is not null)
);
create index entries_couple_when_idx on public.entries(couple_id, happened_at desc);
create trigger entries_touch before update on public.entries for each row execute function public.touch_updated_at();

create table public.hearts (
  entry_id    uuid not null references public.entries(id) on delete cascade,
  couple_id   uuid not null references public.couples(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (entry_id, user_id)
);
create index hearts_couple_idx on public.hearts(couple_id);

create table public.pings (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  from_user   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index pings_couple_idx on public.pings(couple_id, created_at desc);

-- ---------------------------------------------------------------------------
-- daily check-ins (blur-until-you-post is a SELECT policy)
-- ---------------------------------------------------------------------------
create table public.checkins (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  photo_path  text,
  mood        text,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  unique (user_id, day)
);
create index checkins_couple_day_idx on public.checkins(couple_id, day desc);

-- ---------------------------------------------------------------------------
-- question of the day
-- ---------------------------------------------------------------------------
create table public.questions (
  id        int primary key,
  text      text not null,
  category  text not null
);

create table public.answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  int not null references public.questions(id),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  day          date not null,
  text         text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, day)
);
create index answers_couple_day_idx on public.answers(couple_id, day desc);

-- ---------------------------------------------------------------------------
-- goals (jars) + contributions + bucket list
-- ---------------------------------------------------------------------------
create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples(id) on delete cascade,
  name           text not null,
  emoji          text not null default '🫙',
  color          text not null default '#ABD3DE',
  target_amount  numeric(12,2) not null check (target_amount > 0),
  target_date    date,
  completed_at   timestamptz,
  sort           int not null default 0,
  created_at     timestamptz not null default now()
);
create index goals_couple_idx on public.goals(couple_id);

create table public.goal_contributions (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.goals(id) on delete cascade,
  couple_id   uuid not null references public.couples(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index goal_contribs_goal_idx on public.goal_contributions(goal_id);
create index goal_contribs_couple_idx on public.goal_contributions(couple_id, created_at desc);

create table public.bucket_items (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  title       text not null,
  emoji       text not null default '✨',
  added_by    uuid not null references auth.users(id) on delete cascade,
  done_at     timestamptz,
  done_by     uuid references auth.users(id) on delete set null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index bucket_couple_idx on public.bucket_items(couple_id);

-- ---------------------------------------------------------------------------
-- corkboard notes + shared list items + forget-me-nots
-- ---------------------------------------------------------------------------
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  color       text not null default 'n-butter',
  kind        text not null default 'note' check (kind in ('note','list')),
  pinned_top  boolean not null default false,
  pinned_day  date,
  goal_id     uuid references public.goals(id) on delete set null,
  tilt        numeric(5,2) not null default 0,
  pos_x       numeric(5,4) not null default 0.05,
  pos_y       numeric(5,4) not null default 0.05,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notes_couple_idx on public.notes(couple_id);
create trigger notes_touch before update on public.notes for each row execute function public.touch_updated_at();

-- content is author-only; pins/position may be changed by either partner
create or replace function public.notes_guard()
returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'a note keeps its author';
  end if;
  if auth.uid() is not null and auth.uid() <> old.user_id then
    if new.title <> old.title or new.body <> old.body or new.color <> old.color or new.kind <> old.kind then
      raise exception 'only the author can rewrite a note — pins and position are shared';
    end if;
  end if;
  return new;
end $$;
create trigger notes_guard_trg before update on public.notes for each row execute function public.notes_guard();

create table public.list_items (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.notes(id) on delete cascade,
  couple_id   uuid not null references public.couples(id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  added_by    uuid not null references auth.users(id) on delete cascade,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index list_items_note_idx on public.list_items(note_id);
create index list_items_couple_idx on public.list_items(couple_id);

create table public.facts (
  id                uuid primary key default gen_random_uuid(),
  couple_id         uuid not null references public.couples(id) on delete cascade,
  about_profile_id  uuid references public.profiles(id) on delete cascade,   -- null = Us
  section           text not null default 'other' check (section in ('dates','favs','other')),
  emoji             text not null default '💭',
  label             text not null default '',
  value             text not null default '',
  sort              int not null default 0,
  created_at        timestamptz not null default now()
);
create index facts_couple_idx on public.facts(couple_id);

-- ---------------------------------------------------------------------------
-- calendar marks (source of countdowns)
-- ---------------------------------------------------------------------------
create table public.calendar_marks (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  day         date not null,
  label       text not null,
  emoji       text not null default '📌',
  kind        text not null default 'other' check (kind in ('bill','trip','birthday','anniv','other')),
  recurs      text not null default 'none' check (recurs in ('none','monthly','yearly')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index marks_couple_idx on public.calendar_marks(couple_id, day);

-- ---------------------------------------------------------------------------
-- cycle (owner-only writes, partner read opt-in via profiles.cycle_shared)
-- ---------------------------------------------------------------------------
create table public.cycles (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  period_start  date not null,
  period_end    date,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  unique (user_id, period_start)
);
create index cycles_couple_idx on public.cycles(couple_id, period_start);

create table public.cycle_logs (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  flow        text check (flow is null or flow in ('light','medium','heavy')),
  symptoms    text[] not null default '{}',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  unique (user_id, day)
);
create index cycle_logs_couple_idx on public.cycle_logs(couple_id, day);

-- ---------------------------------------------------------------------------
-- recaps (cached monthly envelope)
-- ---------------------------------------------------------------------------
create table public.recaps (
  couple_id     uuid not null references public.couples(id) on delete cascade,
  month         date not null,
  payload       jsonb not null,
  generated_at  timestamptz not null default now(),
  primary key (couple_id, month)
);

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.couples            enable row level security;
alter table public.profiles           enable row level security;
alter table public.invites            enable row level security;
alter table public.categories         enable row level security;
alter table public.entries            enable row level security;
alter table public.hearts             enable row level security;
alter table public.pings              enable row level security;
alter table public.checkins           enable row level security;
alter table public.questions          enable row level security;
alter table public.answers            enable row level security;
alter table public.goals              enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.bucket_items       enable row level security;
alter table public.notes              enable row level security;
alter table public.list_items         enable row level security;
alter table public.facts              enable row level security;
alter table public.calendar_marks     enable row level security;
alter table public.cycles             enable row level security;
alter table public.cycle_logs         enable row level security;
alter table public.recaps             enable row level security;

-- couples: members read + update settings (dates, timezone). No client insert/delete.
create policy couples_select on public.couples for select to authenticated
  using (id = public.current_couple_id());
create policy couples_update on public.couples for update to authenticated
  using (id = public.current_couple_id()) with check (id = public.current_couple_id());

-- profiles: own row + partner's row; update own only (couple_id guarded by trigger)
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or (couple_id is not null and couple_id = public.current_couple_id()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- invites: members may see their couple's invites; writes only via functions
create policy invites_select on public.invites for select to authenticated
  using (couple_id = public.current_couple_id());

-- questions: global read
create policy questions_select on public.questions for select to authenticated using (true);

-- shared couple tables: either partner may do anything inside the couple
do $$
declare t text;
begin
  foreach t in array array['categories','goals','bucket_items','facts','calendar_marks','list_items','recaps']
  loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (couple_id = public.current_couple_id())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (couple_id = public.current_couple_id())', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (couple_id = public.current_couple_id()) with check (couple_id = public.current_couple_id())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (couple_id = public.current_couple_id())', t);
  end loop;
end $$;

-- entries: both read; insert as yourself; edit/delete own only
create policy entries_select on public.entries for select to authenticated
  using (couple_id = public.current_couple_id());
create policy entries_insert on public.entries for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy entries_update on public.entries for update to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid())
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy entries_delete on public.entries for delete to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid());

-- hearts: both read; add/remove your own
create policy hearts_select on public.hearts for select to authenticated
  using (couple_id = public.current_couple_id());
create policy hearts_insert on public.hearts for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy hearts_delete on public.hearts for delete to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid());

-- pings: both read; send as yourself
create policy pings_select on public.pings for select to authenticated
  using (couple_id = public.current_couple_id());
create policy pings_insert on public.pings for insert to authenticated
  with check (couple_id = public.current_couple_id() and from_user = auth.uid());

-- checkins: own always; partner's only once you've posted for that day
create policy checkins_select on public.checkins for select to authenticated
  using (couple_id = public.current_couple_id() and (user_id = auth.uid() or public.has_checked_in(day)));
create policy checkins_insert on public.checkins for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy checkins_update on public.checkins for update to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid())
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy checkins_delete on public.checkins for delete to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid());

-- answers: same reveal rule
create policy answers_select on public.answers for select to authenticated
  using (couple_id = public.current_couple_id() and (user_id = auth.uid() or public.has_answered(day)));
create policy answers_insert on public.answers for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy answers_update on public.answers for update to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid())
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy answers_delete on public.answers for delete to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid());

-- goal contributions: both read; own insert/edit/delete
create policy gc_select on public.goal_contributions for select to authenticated
  using (couple_id = public.current_couple_id());
create policy gc_insert on public.goal_contributions for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy gc_update on public.goal_contributions for update to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid())
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy gc_delete on public.goal_contributions for delete to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid());

-- notes: both read; insert as yourself; update either (content guarded by trigger); delete author only
create policy notes_select on public.notes for select to authenticated
  using (couple_id = public.current_couple_id());
create policy notes_insert on public.notes for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy notes_update on public.notes for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());
create policy notes_delete on public.notes for delete to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid());

-- cycles / cycle_logs: owner writes; partner reads only if the owner shares
create policy cycles_select on public.cycles for select to authenticated
  using (couple_id = public.current_couple_id() and (user_id = auth.uid() or public.shares_cycle(user_id)));
create policy cycles_insert on public.cycles for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy cycles_update on public.cycles for update to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid())
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy cycles_delete on public.cycles for delete to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid());

create policy cycle_logs_select on public.cycle_logs for select to authenticated
  using (couple_id = public.current_couple_id() and (user_id = auth.uid() or public.shares_cycle(user_id)));
create policy cycle_logs_insert on public.cycle_logs for insert to authenticated
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy cycle_logs_update on public.cycle_logs for update to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid())
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());
create policy cycle_logs_delete on public.cycle_logs for delete to authenticated
  using (couple_id = public.current_couple_id() and user_id = auth.uid());

-- ===========================================================================
-- Storage policies — private buckets, paths mirror table rules
--   checkins/  <couple_id>/<user_id>/<YYYY-MM-DD>.<ext>   (blur rule applies)
--   moments/   <couple_id>/<user_id>/<anything>
--   avatars/   <user_id>/<anything>
-- ===========================================================================
create or replace function public.storage_day(name text)
returns date language plpgsql immutable as $$
begin
  return split_part(storage.filename(name), '.', 1)::date;
exception when others then
  return null;
end $$;

create policy "checkins read" on storage.objects for select to authenticated
  using (
    bucket_id = 'checkins'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
    and ((storage.foldername(name))[2] = auth.uid()::text
         or public.has_checked_in(public.storage_day(name)))
  );
create policy "checkins write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'checkins'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );
create policy "checkins update" on storage.objects for update to authenticated
  using (bucket_id = 'checkins' and (storage.foldername(name))[1] = public.current_couple_id()::text and (storage.foldername(name))[2] = auth.uid()::text);
create policy "checkins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'checkins' and (storage.foldername(name))[1] = public.current_couple_id()::text and (storage.foldername(name))[2] = auth.uid()::text);

create policy "moments read" on storage.objects for select to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[1] = public.current_couple_id()::text);
create policy "moments write" on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and (storage.foldername(name))[1] = public.current_couple_id()::text and (storage.foldername(name))[2] = auth.uid()::text);
create policy "moments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[1] = public.current_couple_id()::text and (storage.foldername(name))[2] = auth.uid()::text);

create policy "avatars read" on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or exists (select 1 from public.profiles p
                    where p.id::text = (storage.foldername(name))[1]
                      and p.couple_id is not null and p.couple_id = public.current_couple_id()))
  );
create policy "avatars write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===========================================================================
-- Couple lifecycle (SECURITY DEFINER) — the only way couple_id ever changes
-- ===========================================================================
create or replace function public.gen_invite_code()
returns text language plpgsql as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_code text; i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invites where invites.code = v_code);
  end loop;
  return v_code;
end $$;

-- the forget-me-not scaffolding a new member gets (empty, to be filled in)
create or replace function public.seed_person_facts(p_couple uuid, p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
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

create or replace function public.create_couple()
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c uuid; v_code text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if (select couple_id from public.profiles where id = me) is not null then
    raise exception 'you''re already in a Duo';
  end if;

  insert into public.couples (created_by) values (me) returning id into c;

  perform set_config('duo.lifecycle', 'on', true);
  update public.profiles set couple_id = c where id = me;

  insert into public.categories (couple_id, name, emoji, color, sort) values
    (c, 'Food',      '🍜', '#FBE3DB', 0),
    (c, 'Groceries', '🥕', '#E4EEDF', 1),
    (c, 'Transport', '🛺', '#DDEBF0', 2),
    (c, 'Fun',       '🎬', '#FDEBC8', 3),
    (c, 'Bills',     '💡', '#EFE4F2', 4),
    (c, 'Gifts',     '🎁', '#FBDDE4', 5),
    (c, 'Other',     '🌀', '#EDE7DE', 6);

  perform public.seed_person_facts(c, me);
  insert into public.facts (couple_id, about_profile_id, section, emoji, label, sort) values
    (c, null, 'dates', '🥂', 'Anniversary', 0),
    (c, null, 'dates', '🍷', 'First date', 1),
    (c, null, 'favs',  '🍽', 'Our restaurant', 0),
    (c, null, 'favs',  '🎬', 'Our movie', 1),
    (c, null, 'other', '🎵', 'Our song', 0);

  v_code := public.gen_invite_code();
  insert into public.invites (code, couple_id, created_by) values (v_code, c, me);

  return json_build_object('couple_id', c, 'code', v_code);
end $$;

-- a fresh code for the waiting screen (old unused ones expire)
create or replace function public.create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c uuid; v_code text; members int;
begin
  select couple_id into c from public.profiles where id = me;
  if c is null then raise exception 'start a Duo first'; end if;
  select count(*) into members from public.profiles where couple_id = c;
  if members >= 2 then raise exception 'your Duo is already complete 💛'; end if;
  update public.invites set expires_at = now() where couple_id = c and used_at is null and expires_at > now();
  v_code := public.gen_invite_code();
  insert into public.invites (code, couple_id, created_by) values (v_code, c, me);
  return v_code;
end $$;

-- what /join/[code] may show before login: who invited you, and whether it's still good
create or replace function public.invite_preview(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare inv public.invites; inviter text; members int;
begin
  select * into inv from public.invites i where i.code = upper(trim(p_code));
  if inv.code is null then return json_build_object('ok', false, 'reason', 'unknown'); end if;
  if inv.used_at is not null then return json_build_object('ok', false, 'reason', 'used'); end if;
  if inv.expires_at < now() then return json_build_object('ok', false, 'reason', 'expired'); end if;
  select count(*) into members from public.profiles where couple_id = inv.couple_id;
  if members >= 2 then return json_build_object('ok', false, 'reason', 'full'); end if;
  select display_name into inviter from public.profiles where id = inv.created_by;
  return json_build_object('ok', true, 'inviter', coalesce(nullif(inviter, ''), 'Someone'));
end $$;
grant execute on function public.invite_preview(text) to anon, authenticated;

create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv public.invites; members int;
begin
  if me is null then raise exception 'not signed in'; end if;
  if (select couple_id from public.profiles where id = me) is not null then
    raise exception 'you''re already in a Duo';
  end if;
  select * into inv from public.invites i where i.code = upper(trim(p_code)) for update;
  if inv.code is null then raise exception 'that code doesn''t look right'; end if;
  if inv.used_at is not null then raise exception 'that invite was already used'; end if;
  if inv.expires_at < now() then raise exception 'that invite has expired — ask for a fresh one'; end if;
  if inv.created_by = me then raise exception 'that''s your own invite 😄'; end if;

  perform pg_advisory_xact_lock(hashtext(inv.couple_id::text));
  select count(*) into members from public.profiles where couple_id = inv.couple_id;
  if members >= 2 then raise exception 'this Duo already has two people in it'; end if;

  perform set_config('duo.lifecycle', 'on', true);
  update public.profiles set couple_id = inv.couple_id where id = me;
  update public.invites i set used_by = me, used_at = now() where i.code = inv.code;
  perform public.seed_person_facts(inv.couple_id, me);
  return inv.couple_id;
end $$;

create or replace function public.leave_couple()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c uuid; remaining int;
begin
  select couple_id into c from public.profiles where id = me;
  if c is null then return; end if;
  perform set_config('duo.lifecycle', 'on', true);
  update public.profiles set couple_id = null, cycle_shared = false where id = me;
  select count(*) into remaining from public.profiles where couple_id = c;
  if remaining = 0 then
    delete from public.couples where id = c;   -- rows cascade; storage is swept by /api/cleanup
  else
    update public.invites set expires_at = now() where couple_id = c and used_at is null;
  end if;
end $$;

create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  perform public.leave_couple();
  delete from auth.users where id = me;
end $$;

-- couple members (for the shell: me + partner)
create or replace function public.couple_members()
returns setof public.profiles language sql stable security definer set search_path = public as $$
  select * from public.profiles where couple_id is not null and couple_id = public.current_couple_id()
$$;

revoke execute on function public.seed_person_facts(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.gen_invite_code() from public, anon, authenticated;

-- ===========================================================================
-- Realtime
-- ===========================================================================
alter publication supabase_realtime add table
  public.profiles, public.couples, public.entries, public.hearts, public.pings, public.checkins,
  public.answers, public.goals, public.goal_contributions, public.bucket_items, public.notes,
  public.list_items, public.facts, public.calendar_marks, public.cycles, public.cycle_logs, public.categories;
