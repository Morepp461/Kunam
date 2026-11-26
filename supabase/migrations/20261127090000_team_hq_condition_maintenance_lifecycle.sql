-- Team HQ: daily condition decay, single maintenance transaction, and audit history.
alter table public.caleris_team_hq_facilities
  add column if not exists last_condition_decay_at timestamptz,
  add column if not exists maintenance_restore_level integer;

-- Preserve all existing facility conditions and active HQ projects on rollout.
update public.caleris_team_hq_facilities
set last_condition_decay_at = coalesce(last_condition_decay_at, now());

alter table public.caleris_team_hq_facilities
  alter column last_condition_decay_at set default now(),
  alter column last_condition_decay_at set not null;

create table if not exists public.caleris_team_hq_audit_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  facility_key text not null references public.caleris_team_hq_facility_configs(facility_key) on update cascade,
  event_type text not null check (event_type in ('condition_decay','level_degraded','maintenance','project_started','project_completed')),
  previous_level integer,
  new_level integer,
  previous_condition numeric(5,2),
  new_condition numeric(5,2),
  amount numeric(20,2) not null default 0 check (amount >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists caleris_team_hq_audit_logs_team_created_idx
  on public.caleris_team_hq_audit_logs(team_id, created_at desc);
create index if not exists caleris_team_hq_audit_logs_facility_idx
  on public.caleris_team_hq_audit_logs(team_id, facility_key, created_at desc);

alter table public.caleris_team_hq_audit_logs enable row level security;
drop policy if exists "Team members can read own HQ audit logs" on public.caleris_team_hq_audit_logs;
create policy "Team members can read own HQ audit logs"
on public.caleris_team_hq_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.members m on m.id = p.member_id
    where p.user_id = (select auth.uid())
      and m.team_id = caleris_team_hq_audit_logs.team_id
      and m.role in ('Owner','Principal')
  )
);
revoke all on public.caleris_team_hq_audit_logs from anon;
grant select on public.caleris_team_hq_audit_logs to authenticated;

create or replace function private.audit_team_hq_facility_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    insert into public.caleris_team_hq_audit_logs(
      team_id, facility_key, event_type, previous_level, new_level,
      previous_condition, new_condition, metadata
    ) values (
      new.team_id, new.facility_key, 'condition_decay', null, new.level,
      null, new.condition, jsonb_build_object('source','facility_created')
    );
    return new;
  end if;

  if new.level is distinct from old.level and new.maintenance_restore_level is not null then
    v_event := 'level_degraded';
  elsif new.condition < old.condition then
    v_event := 'condition_decay';
  else
    return new;
  end if;

  insert into public.caleris_team_hq_audit_logs(
    team_id, facility_key, event_type, previous_level, new_level,
    previous_condition, new_condition, metadata
  ) values (
    new.team_id, new.facility_key, v_event, old.level, new.level,
    old.condition, new.condition,
    jsonb_build_object('source','system_lifecycle','restore_level',new.maintenance_restore_level)
  );
  return new;
end;
$function$;

drop trigger if exists caleris_team_hq_facility_audit on public.caleris_team_hq_facilities;
create trigger caleris_team_hq_facility_audit
after insert or update of level, condition on public.caleris_team_hq_facilities
for each row execute function private.audit_team_hq_facility_change();

create or replace function private.process_team_hq_condition_decay()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_facility public.caleris_team_hq_facilities%rowtype;
  v_days integer;
  v_count integer := 0;
  v_new_condition numeric;
  v_new_level integer;
  v_restore_level integer;
begin
  for v_facility in
    select *
    from public.caleris_team_hq_facilities
    where last_condition_decay_at <= now() - interval '24 hours'
    order by last_condition_decay_at, id
    for update skip locked
  loop
    v_days := floor(extract(epoch from (now() - v_facility.last_condition_decay_at)) / 86400)::integer;
    if v_days < 1 then continue; end if;

    v_new_condition := greatest(0, v_facility.condition - v_days);
    v_new_level := v_facility.level;
    v_restore_level := v_facility.maintenance_restore_level;

    if v_new_condition = 0 and v_facility.condition > 0
       and v_facility.level > 0 and v_restore_level is null then
      v_restore_level := v_facility.level;
      v_new_level := v_facility.level - 1;
    end if;

    update public.caleris_team_hq_facilities
    set condition = v_new_condition,
        level = v_new_level,
        maintenance_restore_level = v_restore_level,
        last_condition_decay_at = last_condition_decay_at + make_interval(days => v_days),
        updated_at = now()
    where id = v_facility.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

create or replace function public.member_pay_team_hq_maintenance(
  p_facility_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_member public.members%rowtype;
  v_team public.teams%rowtype;
  v_config public.caleris_team_hq_facility_configs%rowtype;
  v_facility public.caleris_team_hq_facilities%rowtype;
  v_wallet public.economy_wallet_accounts%rowtype;
  v_bank public.economy_wallet_accounts%rowtype;
  v_transaction public.economy_transactions%rowtype;
  v_restore_level integer;
  v_base_cost numeric;
  v_amount numeric;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Sesi login tidak ditemukan.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then
    raise exception 'Kunci transaksi tidak valid.';
  end if;

  select m.* into v_member
  from public.profiles p
  join public.members m on m.id = p.member_id
  where p.user_id = v_user_id
  for update of m;

  if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then
    raise exception 'Hanya Team Owner atau Principal yang dapat melakukan maintenance.';
  end if;

  select * into v_team from public.teams where id = v_member.team_id for update;
  if not found then raise exception 'Tim tidak ditemukan.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-hq:' || v_team.id::text, 0)
  );

  select * into v_transaction
  from public.economy_transactions
  where idempotency_key = p_idempotency_key;

  if found then
    if v_transaction.event_type <> 'team_hq_upgrade'
       or v_transaction.metadata->>'operation' <> 'maintenance'
       or v_transaction.metadata->>'team_id' <> v_team.id::text
       or v_transaction.metadata->>'facility_key' <> p_facility_key then
      raise exception 'Kunci transaksi telah digunakan untuk transaksi lain.';
    end if;
    return jsonb_build_object(
      'status','duplicate',
      'transaction_id',v_transaction.id,
      'amount',v_transaction.amount
    );
  end if;

  select * into v_config
  from public.caleris_team_hq_facility_configs
  where facility_key = p_facility_key and is_enabled;
  if not found then raise exception 'Fasilitas tidak tersedia.'; end if;

  select * into v_facility
  from public.caleris_team_hq_facilities
  where team_id = v_team.id and facility_key = p_facility_key
  for update;
  if not found then raise exception 'Fasilitas tim tidak ditemukan.'; end if;
  if v_facility.condition >= 50 then
    raise exception 'Maintenance hanya tersedia ketika kondisi fasilitas di bawah 50%%.';
  end if;

  v_restore_level := coalesce(v_facility.maintenance_restore_level, v_facility.level);
  if v_restore_level < 1 then raise exception 'Fasilitas belum memiliki level yang dapat dipulihkan.'; end if;

  v_base_cost := nullif(v_config.maintenance_by_level->>v_restore_level::text, '')::numeric;
  if v_base_cost is null or v_base_cost <= 0 then
    raise exception 'Harga maintenance untuk level fasilitas ini belum tersedia.';
  end if;

  v_amount := round(v_base_cost * (100 - v_facility.condition) / 100, 2);
  if v_amount <= 0 then raise exception 'Tidak ada biaya maintenance yang perlu dibayar.'; end if;

  select * into v_wallet
  from public.economy_wallet_accounts
  where account_kind = 'team' and team_id = v_team.id and is_active
  for update;
  if not found then raise exception 'Team Wallet belum tersedia.'; end if;

  select * into v_bank
  from public.economy_wallet_accounts
  where account_kind = 'vreeo_bank' and is_active
  for update;
  if not found then raise exception 'Wallet VreeoBank tidak tersedia.'; end if;

  v_result := private.post_economy_transaction(
    v_wallet.id,
    v_bank.id,
    v_amount,
    'team_hq_upgrade',
    'Team HQ maintenance: ' || v_config.title || ' level ' || v_restore_level,
    p_idempotency_key,
    v_user_id,
    jsonb_build_object(
      'operation','maintenance',
      'team_id',v_team.id,
      'facility_key',p_facility_key,
      'maintenance_level',v_restore_level,
      'condition_before',v_facility.condition,
      'condition_after',100,
      'base_cost',v_base_cost
    ),
    null,
    false
  );

  update public.caleris_team_hq_facilities
  set level = v_restore_level,
      condition = 100,
      maintenance_restore_level = null,
      last_maintenance_at = now(),
      last_condition_decay_at = now(),
      updated_at = now()
  where id = v_facility.id;

  insert into public.caleris_team_hq_audit_logs(
    team_id, facility_key, event_type, previous_level, new_level,
    previous_condition, new_condition, amount, metadata, actor_id
  ) values (
    v_team.id, p_facility_key, 'maintenance',
    v_facility.level, v_restore_level, v_facility.condition, 100,
    v_amount,
    jsonb_build_object(
      'transaction_id',v_result->>'transaction_id',
      'base_cost',v_base_cost,
      'missing_condition_percent',100-v_facility.condition
    ),
    v_user_id
  );

  return jsonb_build_object(
    'status','paid',
    'transaction_id',v_result->>'transaction_id',
    'amount',v_amount,
    'restored_level',v_restore_level,
    'condition',100
  );
end;
$function$;

revoke all on function public.member_pay_team_hq_maintenance(text,text) from public, anon;
grant execute on function public.member_pay_team_hq_maintenance(text,text) to authenticated;
revoke all on function private.process_team_hq_condition_decay() from public, anon, authenticated;

do $$
begin
  if exists(select 1 from cron.job where jobname = 'caleris-team-hq-condition-decay') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'caleris-team-hq-condition-decay' limit 1));
  end if;
  perform cron.schedule(
    'caleris-team-hq-condition-decay',
    '17 * * * *',
    'select private.process_team_hq_condition_decay();'
  );
end
$$;


-- Attach operational history to the active season and retain only the current season's logs.
alter table public.caleris_team_hq_audit_logs
  add column if not exists season_id uuid references public.license_seasons(id) on delete set null,
  add column if not exists season_key text;

create or replace function private.set_team_hq_audit_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.season_id is null then
    select id, season_key
      into new.season_id, new.season_key
    from public.license_seasons
    where status = 'active'
    order by starts_on desc, created_at desc
    limit 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_team_hq_audit_season on public.caleris_team_hq_audit_logs;
create trigger caleris_team_hq_audit_season
before insert on public.caleris_team_hq_audit_logs
for each row execute function private.set_team_hq_audit_season();

create or replace function private.audit_team_hq_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('queued','in_progress') then return new; end if;
    v_event := 'project_started';
  elsif new.status = 'completed' and old.status is distinct from new.status then
    v_event := 'project_completed';
  else
    return new;
  end if;

  insert into public.caleris_team_hq_audit_logs(
    team_id, facility_key, event_type, amount, metadata, actor_id
  ) values (
    new.team_id, new.facility_key, v_event, new.cost,
    jsonb_build_object(
      'project_id',new.id,
      'target_level',new.target_level,
      'status',new.status,
      'started_at',new.started_at,
      'completes_at',new.completes_at,
      'completed_at',new.completed_at
    ),
    coalesce(new.created_by, (select auth.uid()))
  );
  return new;
end;
$function$;

drop trigger if exists caleris_team_hq_project_audit on public.caleris_team_hq_projects;
create trigger caleris_team_hq_project_audit
after insert or update of status on public.caleris_team_hq_projects
for each row execute function private.audit_team_hq_project_change();

create or replace function private.prune_team_hq_audit_logs()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_active_season uuid;
  v_deleted integer;
begin
  select id into v_active_season
  from public.license_seasons
  where status = 'active'
  order by starts_on desc, created_at desc
  limit 1;

  if v_active_season is null then return 0; end if;

  delete from public.caleris_team_hq_audit_logs
  where season_id is not null and season_id <> v_active_season;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.prune_team_hq_audit_logs() from public, anon, authenticated;
do $$
begin
  if exists(select 1 from cron.job where jobname = 'caleris-team-hq-audit-retention') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'caleris-team-hq-audit-retention' limit 1));
  end if;
  perform cron.schedule(
    'caleris-team-hq-audit-retention',
    '23 * * * *',
    'select private.prune_team_hq_audit_logs();'
  );
end
$$;
