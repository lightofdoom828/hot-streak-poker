-- Sample night for local development. Run AFTER the migration, and after at least one host has
-- signed in (entries are attributed to the first host). Safe to run once on an empty database.
do $$
declare
  h uuid := (select id from public.hosts order by display_name limit 1);
  n uuid;
  sam uuid; priya uuid; dan uuid; mei uuid;
begin
  if h is null then
    raise exception 'Sign in as a host first, then run the seed.';
  end if;

  insert into public.players (name) values ('Sam') returning id into sam;
  insert into public.players (name) values ('Priya') returning id into priya;
  insert into public.players (name) values ('Dan') returning id into dan;
  insert into public.players (name, referred_by) values ('Mei', sam) returning id into mei;

  insert into public.nights (venue, opened_by, default_buyin_cents)
  values ('Home game', h, 20000) returning id into n;

  insert into public.buyins (night_id, player_id, amount_cents, payment_status, payment_method, is_comp, created_by) values
    (n, sam,   20000, 'paid',   'payid',         false, h),
    (n, sam,   10000, 'unpaid', null,            false, h),
    (n, priya, 20000, 'paid',   'bank_transfer', false, h),
    (n, dan,   20000, 'unpaid', null,            false, h),
    (n, mei,    5000, null,     null,            true,  h),
    (n, mei,   20000, 'paid',   'cash',          false, h);

  insert into public.cashouts (night_id, player_id, amount_cents, payout_status, created_by) values
    (n, sam,   45000, 'pending', h),
    (n, priya, 12000, 'pending', h);

  insert into public.expenses (night_id, category, amount_cents, note, paid_by, status, created_by) values
    (n, 'food',    6000, 'Pizza', h, 'paid',    h),
    (n, 'dealer', 15000, null,    h, 'pending', h);
end;
$$;
