-- Hot Streak Poker — Host Book: Phase 1 schema.
-- Money is integer cents. Financial rows are soft-deleted only. Closed nights are read-only,
-- enforced here (RLS + triggers), not just in the UI.

-- ---------------------------------------------------------------------------
-- Hosts and the sign-in allowlist
-- ---------------------------------------------------------------------------
create table public.host_allowlist (
  email        text primary key check (email = lower(email)),
  display_name text not null
);

create table public.hosts (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  display_name text not null
);

-- Reject sign-ups from any email that is not on the allowlist...
create or replace function public.check_auth_user_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.host_allowlist where email = lower(new.email)) then
    raise exception 'Email % is not on the Hot Streak host list', new.email
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_check
  before insert on auth.users
  for each row execute function public.check_auth_user_allowed();

-- ...and register allowed ones as hosts once the auth row exists (hosts.id references it).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hosts (id, email, display_name)
  select new.id, a.email, a.display_name from public.host_allowlist a where a.email = lower(new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- An allowlisted email that signed up before being listed (or a host re-added) gets its host row here.
create or replace function public.sync_host_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hosts (id, email, display_name)
  select u.id, lower(u.email), new.display_name from auth.users u where lower(u.email) = new.email
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end;
$$;

create trigger on_allowlist_upsert
  after insert or update on public.host_allowlist
  for each row execute function public.sync_host_from_allowlist();

create or replace function public.is_host()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.hosts where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  referred_by uuid references public.players (id),
  notes       text,
  created_at  timestamptz not null default now(),
  archived    boolean not null default false
);
create unique index players_name_unique on public.players (lower(trim(name)));

create table public.nights (
  id                  uuid primary key default gen_random_uuid(),
  -- The Melbourne date the night started; a night past midnight keeps it.
  date                date not null default (now() at time zone 'Australia/Melbourne')::date,
  venue               text,
  status              text not null default 'open' check (status in ('open', 'closed')),
  opened_by           uuid references public.hosts (id) default auth.uid(),
  closed_by           uuid references public.hosts (id),
  closed_at           timestamptz,
  default_buyin_cents integer not null default 20000 check (default_buyin_cents > 0),
  notes               text,
  created_at          timestamptz not null default now(),
  check ((status = 'closed') = (closed_at is not null))
);

create table public.buyins (
  id             uuid primary key default gen_random_uuid(),
  night_id       uuid not null references public.nights (id),
  player_id      uuid not null references public.players (id),
  amount_cents   integer not null check (amount_cents > 0),
  payment_status text check (payment_status in ('paid', 'unpaid')),
  payment_method text check (payment_method in ('payid', 'bank_transfer', 'cash', 'other')),
  is_comp        boolean not null default false,
  created_by     uuid references public.hosts (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  -- A comp has no payment status; a real buy-in always has one.
  check (
    (is_comp and payment_status is null and payment_method is null)
    or (not is_comp and payment_status is not null)
  )
);

create table public.cashouts (
  id              uuid primary key default gen_random_uuid(),
  night_id        uuid not null references public.nights (id),
  player_id       uuid not null references public.players (id),
  amount_cents    integer not null check (amount_cents >= 0),
  payout_status   text not null default 'pending' check (payout_status in ('sent', 'pending')),
  override_reason text,
  created_by      uuid references public.hosts (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  night_id     uuid not null references public.nights (id),
  category     text not null check (category in ('food', 'dealer', 'referral_bonus', 'new_player_bonus', 'venue', 'misc')),
  amount_cents integer not null check (amount_cents > 0),
  note         text,
  paid_by      uuid references public.hosts (id),
  status       text not null default 'paid' check (status in ('paid', 'pending')),
  created_by   uuid references public.hosts (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index buyins_night_idx on public.buyins (night_id);
create index cashouts_night_idx on public.cashouts (night_id);
create index expenses_night_idx on public.expenses (night_id);
create index buyins_player_idx on public.buyins (player_id);
create index cashouts_player_idx on public.cashouts (player_id);
create index players_referred_by_idx on public.players (referred_by);
create index nights_date_idx on public.nights (date desc);

create table public.audit_log (
  id         bigserial primary key,
  table_name text not null,
  row_id     uuid not null,
  action     text not null,
  before     jsonb,
  after      jsonb,
  actor      uuid,
  at         timestamptz not null default now()
);
create index audit_log_row_idx on public.audit_log (row_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger buyins_touch before update on public.buyins for each row execute function public.touch_updated_at();
create trigger cashouts_touch before update on public.cashouts for each row execute function public.touch_updated_at();
create trigger expenses_touch before update on public.expenses for each row execute function public.touch_updated_at();

-- Nothing financial is ever hard-deleted, whoever is asking.
create or replace function public.forbid_hard_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception '% rows are never hard-deleted; set deleted_at instead', tg_table_name
    using errcode = '42501';
end;
$$;

create trigger buyins_no_delete before delete on public.buyins for each row execute function public.forbid_hard_delete();
create trigger cashouts_no_delete before delete on public.cashouts for each row execute function public.forbid_hard_delete();
create trigger expenses_no_delete before delete on public.expenses for each row execute function public.forbid_hard_delete();
create trigger nights_no_delete before delete on public.nights for each row execute function public.forbid_hard_delete();

-- Entries can only be written while their night is open (applies to every role, service role included).
create or replace function public.ensure_night_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.nights where id = new.night_id and status = 'closed')
     or (tg_op = 'UPDATE' and exists (select 1 from public.nights where id = old.night_id and status = 'closed')) then
    raise exception 'Night is closed and read-only. Reopen it first.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger buyins_night_open before insert or update on public.buyins for each row execute function public.ensure_night_open();
create trigger cashouts_night_open before insert or update on public.cashouts for each row execute function public.ensure_night_open();
create trigger expenses_night_open before insert or update on public.expenses for each row execute function public.ensure_night_open();

-- A cash-out may not take the book below zero unless a host typed a reason.
create or replace function public.guard_cashout_book()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  issued   bigint;
  returned bigint;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  -- Only re-check when the amount grows or the row is (re)activated.
  if tg_op = 'UPDATE' and old.deleted_at is null and new.amount_cents <= old.amount_cents then
    return new;
  end if;
  select coalesce(sum(amount_cents), 0) into issued
    from public.buyins where night_id = new.night_id and deleted_at is null;
  select coalesce(sum(amount_cents), 0) into returned
    from public.cashouts where night_id = new.night_id and deleted_at is null and id <> new.id;
  if issued - returned - new.amount_cents < 0 and coalesce(trim(new.override_reason), '') = '' then
    raise exception 'This cash-out exceeds chips on the books by % cents', -(issued - returned - new.amount_cents)
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger cashouts_book_guard before insert or update on public.cashouts
  for each row execute function public.guard_cashout_book();

-- Closed nights: no edits at all. Reopening only through reopen_night(), which records a reason.
create or replace function public.guard_night_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'closed' then
    if new.status = 'open' and coalesce(current_setting('app.reopen_reason', true), '') <> '' then
      new.closed_at := null;
      new.closed_by := null;
      return new;
    end if;
    raise exception 'Night is closed and read-only. Use "Reopen night".' using errcode = '42501';
  end if;
  if new.status = 'closed' and coalesce(current_setting('app.closing', true), '') <> '1' then
    raise exception 'Close a night with close_night() so it is validated.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger nights_guard before update on public.nights
  for each row execute function public.guard_night_update();

-- ---------------------------------------------------------------------------
-- Audit log (every write to nights, buyins, cashouts, expenses)
-- ---------------------------------------------------------------------------
create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act text := lower(tg_op);
  before_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row  jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' then
    if before_row ? 'deleted_at' and (before_row ->> 'deleted_at') is null and (after_row ->> 'deleted_at') is not null then
      act := 'soft_delete';
    elsif before_row ? 'deleted_at' and (before_row ->> 'deleted_at') is not null and (after_row ->> 'deleted_at') is null then
      act := 'restore';
    elsif tg_table_name = 'nights' and (before_row ->> 'status') = 'open' and (after_row ->> 'status') = 'closed' then
      act := 'close';
    elsif tg_table_name = 'nights' and (before_row ->> 'status') = 'closed' and (after_row ->> 'status') = 'open' then
      act := 'reopen';
      after_row := after_row || jsonb_build_object('reopen_reason', current_setting('app.reopen_reason', true));
    end if;
  end if;
  insert into public.audit_log (table_name, row_id, action, before, after, actor)
  values (tg_table_name, coalesce(new.id, old.id), act, before_row, after_row, auth.uid());
  return coalesce(new, old);
end;
$$;

create trigger nights_audit after insert or update on public.nights for each row execute function public.write_audit();
create trigger buyins_audit after insert or update on public.buyins for each row execute function public.write_audit();
create trigger cashouts_audit after insert or update on public.cashouts for each row execute function public.write_audit();
create trigger expenses_audit after insert or update on public.expenses for each row execute function public.write_audit();

-- ---------------------------------------------------------------------------
-- Close / reopen
-- ---------------------------------------------------------------------------
create or replace function public.close_night(p_night_id uuid)
returns public.nights
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.nights;
  book bigint;
begin
  if not public.is_host() then
    raise exception 'Only hosts can close a night' using errcode = '42501';
  end if;
  select * into n from public.nights where id = p_night_id for update;
  if not found then
    raise exception 'Night not found' using errcode = 'P0002';
  end if;
  if n.status = 'closed' then
    return n;
  end if;
  select coalesce((select sum(amount_cents) from public.buyins where night_id = p_night_id and deleted_at is null), 0)
       - coalesce((select sum(amount_cents) from public.cashouts where night_id = p_night_id and deleted_at is null), 0)
    into book;
  if book < 0 then
    raise exception 'Book is negative (% cents); fix the entries before closing', book using errcode = '23514';
  end if;
  perform set_config('app.closing', '1', true);
  update public.nights set status = 'closed', closed_at = now(), closed_by = auth.uid()
    where id = p_night_id returning * into n;
  perform set_config('app.closing', '', true);
  return n;
end;
$$;

create or replace function public.reopen_night(p_night_id uuid, p_reason text)
returns public.nights
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.nights;
begin
  if not public.is_host() then
    raise exception 'Only hosts can reopen a night' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reopen a night' using errcode = '22023';
  end if;
  perform set_config('app.reopen_reason', trim(p_reason), true);
  update public.nights set status = 'open' where id = p_night_id and status = 'closed' returning * into n;
  perform set_config('app.reopen_reason', '', true);
  if n.id is null then
    raise exception 'Night not found or not closed' using errcode = 'P0002';
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: only hosts, and never a write to a closed night
-- ---------------------------------------------------------------------------
create or replace function public.night_is_open(p_night_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.nights where id = p_night_id and status = 'open');
$$;

alter table public.host_allowlist enable row level security;
alter table public.hosts          enable row level security;
alter table public.players        enable row level security;
alter table public.nights         enable row level security;
alter table public.buyins         enable row level security;
alter table public.cashouts       enable row level security;
alter table public.expenses       enable row level security;
alter table public.audit_log      enable row level security;

-- host_allowlist: no client access at all (managed with SQL, see README).
create policy hosts_read on public.hosts for select to authenticated using (public.is_host());

create policy players_read   on public.players for select to authenticated using (public.is_host());
create policy players_insert on public.players for insert to authenticated with check (public.is_host());
create policy players_update on public.players for update to authenticated using (public.is_host()) with check (public.is_host());

create policy nights_read   on public.nights for select to authenticated using (public.is_host());
create policy nights_insert on public.nights for insert to authenticated with check (public.is_host() and status = 'open');
create policy nights_update on public.nights for update to authenticated
  using (public.is_host() and status = 'open') with check (public.is_host());

create policy buyins_read   on public.buyins for select to authenticated using (public.is_host());
create policy buyins_insert on public.buyins for insert to authenticated
  with check (public.is_host() and public.night_is_open(night_id));
create policy buyins_update on public.buyins for update to authenticated
  using (public.is_host() and public.night_is_open(night_id))
  with check (public.is_host() and public.night_is_open(night_id));

create policy cashouts_read   on public.cashouts for select to authenticated using (public.is_host());
create policy cashouts_insert on public.cashouts for insert to authenticated
  with check (public.is_host() and public.night_is_open(night_id));
create policy cashouts_update on public.cashouts for update to authenticated
  using (public.is_host() and public.night_is_open(night_id))
  with check (public.is_host() and public.night_is_open(night_id));

create policy expenses_read   on public.expenses for select to authenticated using (public.is_host());
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_host() and public.night_is_open(night_id));
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_host() and public.night_is_open(night_id))
  with check (public.is_host() and public.night_is_open(night_id));

create policy audit_read on public.audit_log for select to authenticated using (public.is_host());

-- Table privileges: anon gets nothing; nobody gets DELETE on financial tables.
revoke all on public.host_allowlist, public.hosts, public.players, public.nights,
  public.buyins, public.cashouts, public.expenses, public.audit_log from anon;
revoke all on public.host_allowlist from authenticated;
revoke delete, truncate on public.players, public.nights, public.buyins, public.cashouts,
  public.expenses, public.audit_log from authenticated;
revoke insert, update on public.audit_log, public.hosts from authenticated;
grant select on public.hosts, public.audit_log to authenticated;
grant select, insert, update on public.players, public.nights, public.buyins, public.cashouts, public.expenses to authenticated;

revoke execute on function public.close_night(uuid), public.reopen_night(uuid, text) from public, anon;
grant execute on function public.close_night(uuid), public.reopen_night(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.nights, public.buyins, public.cashouts, public.expenses, public.players;
  end if;
end;
$$;
