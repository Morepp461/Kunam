begin;

create table if not exists public.caleris_team_owner_tenures (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  owner_member_id uuid not null references public.members(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz,
  source_takeover_id uuid references public.caleris_team_takeovers(id) on delete restrict,
  financial_health_score_snapshot smallint check (financial_health_score_snapshot between 0 and 100),
  contract_stability_score_snapshot smallint check (contract_stability_score_snapshot between 0 and 100),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);
create unique index if not exists caleris_team_owner_tenures_current_team_idx
  on public.caleris_team_owner_tenures(team_id) where ended_at is null;
create unique index if not exists caleris_team_owner_tenures_takeover_idx
  on public.caleris_team_owner_tenures(source_takeover_id) where source_takeover_id is not null;
create index if not exists caleris_team_owner_tenures_member_idx
  on public.caleris_team_owner_tenures(owner_member_id,started_at desc);
create index if not exists caleris_team_owner_tenures_team_period_idx
  on public.caleris_team_owner_tenures(team_id,started_at,ended_at);

create table if not exists public.caleris_owner_reputation (
  member_id uuid primary key references public.members(id) on delete cascade,
  score smallint not null default 0 check (score between 0 and 100),
  band text not null default 'unproven'
    check (band in ('unproven','developing','established','respected','elite')),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics)='object'),
  calculated_at timestamptz not null default now()
);

create table if not exists public.caleris_owner_reputation_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  previous_score smallint check (previous_score between 0 and 100),
  new_score smallint not null check (new_score between 0 and 100),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics)='object'),
  source_event text not null,
  created_at timestamptz not null default now()
);
create index if not exists caleris_owner_reputation_history_member_idx
  on public.caleris_owner_reputation_history(member_id,created_at desc);

alter table public.caleris_team_owner_tenures enable row level security;
alter table public.caleris_owner_reputation enable row level security;
alter table public.caleris_owner_reputation_history enable row level security;

drop policy if exists caleris_owner_reputation_read_self on public.caleris_owner_reputation;
create policy caleris_owner_reputation_read_self on public.caleris_owner_reputation
for select to authenticated
using (
  member_id=public.caleris_current_member_id()
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists caleris_owner_reputation_history_read_self on public.caleris_owner_reputation_history;
create policy caleris_owner_reputation_history_read_self on public.caleris_owner_reputation_history
for select to authenticated
using (
  member_id=public.caleris_current_member_id()
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);

revoke all on public.caleris_team_owner_tenures,public.caleris_owner_reputation,public.caleris_owner_reputation_history
  from public,anon,authenticated;
grant select on public.caleris_owner_reputation,public.caleris_owner_reputation_history to authenticated;

create or replace function private.caleris_owner_financial_health_score(p_team_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_balance numeric:=0;
  v_debt numeric:=0;
begin
  select coalesce(max(wa.balance),0) into v_balance
  from public.economy_wallet_accounts wa
  where wa.account_kind='team' and wa.team_id=p_team_id and wa.is_active;

  select coalesce(sum(greatest(l.total_due-l.amount_repaid,0)),0) into v_debt
  from public.economy_cash_loans l
  where l.team_id=p_team_id
    and coalesce(l.status,'') not in ('paid','repaid','closed','cancelled','rejected');

  if v_balance+v_debt<=0 then return 50; end if;
  return greatest(0,least(100,round((greatest(v_balance,0)/(greatest(v_balance,0)+v_debt))*100)::integer));
end;
$function$;

create or replace function private.caleris_owner_contract_stability_score(
  p_team_id uuid,p_started_at timestamptz,p_ended_at timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_total integer:=0;
  v_stable integer:=0;
  v_end timestamptz:=coalesce(p_ended_at,now());
begin
  select count(*)::integer,
    count(*) filter(where c.status='active' or c.updated_at>v_end)::integer
  into v_total,v_stable
  from public.economy_driver_contracts c
  where c.team_id=p_team_id
    and c.created_at<=v_end
    and (c.status='active' or c.updated_at>=p_started_at);

  if v_total=0 then return 50; end if;
  return greatest(0,least(100,round(v_stable::numeric/v_total*100)::integer));
end;
$function$;

create or replace function private.caleris_owner_team_achievement_score(
  p_team_id uuid,p_started_at timestamptz,p_ended_at timestamptz
)
returns numeric
language sql
stable
security definer
set search_path=''
as $function$
  with round_team_points as (
    select rs.round_id,rs.team_id_snapshot as team_id,sum(rs.points_total) as points
    from public.license_round_standings rs
    join public.license_rounds lr on lr.id=rs.round_id
    where rs.team_id_snapshot is not null
      and lr.race_starts_at>=p_started_at
      and lr.race_starts_at<coalesce(p_ended_at,'infinity'::timestamptz)
    group by rs.round_id,rs.team_id_snapshot
  ),
  ranked_rounds as (
    select round_id,team_id,points,
      count(*) over(partition by round_id)::numeric as field_size,
      rank() over(partition by round_id order by points desc) as position
    from round_team_points
  )
  select coalesce(avg(
    case when field_size<=1 then 100
      else greatest(0,least(100,100*(field_size-position)/(field_size-1))) end
  ),0)
  from ranked_rounds
  where team_id=p_team_id;
$function$;

create or replace function private.caleris_owner_hq_development_score(
  p_team_id uuid,p_started_at timestamptz,p_ended_at timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_division text;
  v_capacity numeric:=0;
  v_investment numeric:=0;
begin
  select lower(coalesce(t.division_key,'premio')) into v_division
  from public.teams t where t.id=p_team_id;

  select coalesce(sum(case when v_division='zwei' then c.max_level_zwei else c.max_level_premio end),0)
  into v_capacity
  from public.caleris_team_hq_facility_configs c
  where c.is_enabled;

  select coalesce(sum(greatest(coalesce(a.new_level,0)-coalesce(a.previous_level,0),0)),0)
  into v_investment
  from public.caleris_team_hq_audit_logs a
  where a.team_id=p_team_id
    and a.created_at>=p_started_at
    and a.created_at<coalesce(p_ended_at,'infinity'::timestamptz)
    and a.new_level is not null;

  if v_capacity<=0 then return 0; end if;
  return greatest(0,least(100,round(v_investment/v_capacity*100)::integer));
end;
$function$;

create or replace function private.caleris_owner_compliance_score(
  p_member_id uuid,p_team_id uuid,p_started_at timestamptz,p_ended_at timestamptz
)
returns integer
language sql
stable
security definer
set search_path=''
as $function$
  select greatest(0,100-least(100,(
    select count(*)::integer*10
    from public.caleris_fines f
    where f.issued_at>=p_started_at
      and f.issued_at<coalesce(p_ended_at,'infinity'::timestamptz)
      and (f.target_team_id=p_team_id or f.target_member_id=p_member_id)
      and not exists(
        select 1 from public.caleris_appeals a
        where a.fine_id=f.id and a.status='approved'
      )
  )));
$function$;

create or replace function private.caleris_refresh_owner_reputation(
  p_member_id uuid,p_source_event text default 'automatic_recalculation'
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_old_score integer;
  v_score integer;
  v_band text;
  v_achievement numeric:=0;
  v_financial numeric:=50;
  v_contract numeric:=50;
  v_hq numeric:=0;
  v_assets numeric:=0;
  v_compliance numeric:=100;
  v_asset_value numeric:=0;
  v_asset_bonus integer:=0;
  v_metrics jsonb;
begin
  if p_member_id is null or not exists(select 1 from public.members where id=p_member_id) then return; end if;

  insert into public.caleris_team_owner_tenures(team_id,owner_member_id,started_at)
  select m.team_id,m.id,now()
  from public.members m
  where m.id=p_member_id and m.role='Owner' and m.team_id is not null
    and not exists(
      select 1 from public.caleris_team_owner_tenures t
      where t.team_id=m.team_id and t.ended_at is null
    )
  on conflict do nothing;

  if not exists(select 1 from public.caleris_team_owner_tenures where owner_member_id=p_member_id) then return; end if;

  select coalesce(avg(private.caleris_owner_team_achievement_score(t.team_id,t.started_at,t.ended_at)),0),
    coalesce(avg(coalesce(t.financial_health_score_snapshot,
      case when t.ended_at is null then private.caleris_owner_financial_health_score(t.team_id) else 50 end)),50),
    coalesce(avg(coalesce(t.contract_stability_score_snapshot,
      private.caleris_owner_contract_stability_score(t.team_id,t.started_at,t.ended_at))),50),
    coalesce(avg(private.caleris_owner_hq_development_score(t.team_id,t.started_at,t.ended_at)),0),
    coalesce(avg(private.caleris_owner_compliance_score(p_member_id,t.team_id,t.started_at,t.ended_at)),100)
  into v_achievement,v_financial,v_contract,v_hq,v_compliance
  from public.caleris_team_owner_tenures t
  where t.owner_member_id=p_member_id;

  v_asset_value:=private.caleris_assets_market_value(p_member_id);
  v_asset_bonus:=private.caleris_assets_reputation_bonus(p_member_id);
  v_assets:=least(100,greatest(0,v_asset_bonus*10));

  v_score:=greatest(0,least(100,round(
    (v_achievement*25 + v_financial*20 + v_contract*15 + v_hq*15 + v_assets*15 + v_compliance*10)/100
  )::integer));
  v_band:=case
    when v_score>=80 then 'elite'
    when v_score>=60 then 'respected'
    when v_score>=40 then 'established'
    when v_score>=20 then 'developing'
    else 'unproven'
  end;
  v_metrics:=jsonb_build_object(
    'team_achievement',round(v_achievement,2),
    'team_financial_health',round(v_financial,2),
    'driver_contract_stability',round(v_contract,2),
    'hq_investment_development',round(v_hq,2),
    'personal_asset_value',round(v_assets,2),
    'asset_market_value_eur',v_asset_value,
    'existing_asset_reputation_bonus',v_asset_bonus,
    'regulatory_compliance',round(v_compliance,2),
    'weights',jsonb_build_object(
      'team_achievement',25,'team_financial_health',20,'driver_contract_stability',15,
      'hq_investment_development',15,'personal_asset_value',15,'regulatory_compliance',10
    )
  );

  select score into v_old_score from public.caleris_owner_reputation where member_id=p_member_id for update;
  insert into public.caleris_owner_reputation(member_id,score,band,metrics,calculated_at)
  values(p_member_id,v_score,v_band,v_metrics,now())
  on conflict(member_id) do update set
    score=excluded.score,band=excluded.band,metrics=excluded.metrics,calculated_at=excluded.calculated_at;

  if v_old_score is distinct from v_score then
    insert into public.caleris_owner_reputation_history(member_id,previous_score,new_score,metrics,source_event)
    values(p_member_id,v_old_score,v_score,v_metrics,coalesce(nullif(trim(p_source_event),''),'automatic_recalculation'));
  end if;
end;
$function$;

create or replace function private.caleris_refresh_owner_reputation_for_team(
  p_team_id uuid,p_source_event text default 'team_data_change'
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare v_owner record;
begin
  if p_team_id is null then return; end if;
  for v_owner in
    select distinct owner_member_id
    from public.caleris_team_owner_tenures
    where team_id=p_team_id
  loop
    perform private.caleris_refresh_owner_reputation(v_owner.owner_member_id,p_source_event);
  end loop;
end;
$function$;

create or replace function private.caleris_owner_member_tenure_sync()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_team_id uuid;
  v_started_at timestamptz;
begin
  if tg_op='UPDATE' then
   if old.role='Owner' and old.team_id is not null
    and (new.role is distinct from 'Owner' or new.team_id is distinct from old.team_id) then
    v_team_id:=old.team_id;
    select coalesce(t.started_at,tm.created_at,now()) into v_started_at
    from public.teams tm
    left join public.caleris_team_owner_tenures t
      on t.team_id=tm.id and t.owner_member_id=old.id and t.ended_at is null
    where tm.id=v_team_id;

    update public.caleris_team_owner_tenures
    set started_at=least(started_at,now()-interval '1 second'),
      ended_at=now(),
      financial_health_score_snapshot=coalesce(financial_health_score_snapshot,private.caleris_owner_financial_health_score(v_team_id)),
      contract_stability_score_snapshot=coalesce(contract_stability_score_snapshot,
        private.caleris_owner_contract_stability_score(v_team_id,coalesce(v_started_at,now()),now()))
    where team_id=v_team_id and owner_member_id=old.id and ended_at is null;

    if not found then
      insert into public.caleris_team_owner_tenures(
        team_id,owner_member_id,started_at,ended_at,
        financial_health_score_snapshot,contract_stability_score_snapshot
      )
      select v_team_id,old.id,least(coalesce(v_started_at,now()),now()-interval '1 second'),now(),
        private.caleris_owner_financial_health_score(v_team_id),
        private.caleris_owner_contract_stability_score(v_team_id,coalesce(v_started_at,now()),now())
      where not exists(
        select 1 from public.caleris_team_owner_tenures x
        where x.team_id=v_team_id and x.owner_member_id=old.id
      );
    end if;
    perform private.caleris_refresh_owner_reputation(old.id,'owner_team_departure');
   end if;
  end if;

  if new.role='Owner' and new.team_id is not null then
    insert into public.caleris_team_owner_tenures(team_id,owner_member_id,started_at)
    select new.team_id,new.id,now()
    where not exists(
      select 1 from public.caleris_team_owner_tenures t
      where t.team_id=new.team_id and t.ended_at is null
    )
    on conflict do nothing;
    perform private.caleris_refresh_owner_reputation(new.id,'owner_team_assignment');
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function private.caleris_owner_takeover_tenure_sync()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_settled_at timestamptz:=coalesce(new.settled_at,new.updated_at,now());
begin
  if new.status<>'completed' then return new; end if;
  if tg_op='UPDATE' then
    if old.status='completed' then return new; end if;
  end if;

  update public.caleris_team_owner_tenures
  set started_at=least(started_at,v_settled_at-interval '1 second'),
    ended_at=v_settled_at,
    financial_health_score_snapshot=coalesce(financial_health_score_snapshot,
      private.caleris_owner_financial_health_score(new.target_team_id)),
    contract_stability_score_snapshot=coalesce(contract_stability_score_snapshot,
      private.caleris_owner_contract_stability_score(new.target_team_id,started_at,v_settled_at))
  where team_id=new.target_team_id and owner_member_id=new.seller_member_id and ended_at is null;

  if not found and not exists(
    select 1 from public.caleris_team_owner_tenures
    where team_id=new.target_team_id and owner_member_id=new.seller_member_id
  ) then
    insert into public.caleris_team_owner_tenures(
      team_id,owner_member_id,started_at,ended_at,source_takeover_id,
      financial_health_score_snapshot,contract_stability_score_snapshot
    )
    select new.target_team_id,new.seller_member_id,
      least(coalesce(t.created_at,v_settled_at-interval '1 second'),v_settled_at-interval '1 second'),
      v_settled_at,null,
      private.caleris_owner_financial_health_score(new.target_team_id),
      private.caleris_owner_contract_stability_score(new.target_team_id,
        coalesce(t.created_at,v_settled_at-interval '1 day'),v_settled_at)
    from public.teams t where t.id=new.target_team_id;
  end if;

  update public.caleris_team_owner_tenures
  set started_at=v_settled_at,source_takeover_id=new.id
  where team_id=new.target_team_id and owner_member_id=new.buyer_member_id and ended_at is null;

  if not found then
    insert into public.caleris_team_owner_tenures(team_id,owner_member_id,started_at,source_takeover_id)
    values(new.target_team_id,new.buyer_member_id,v_settled_at,new.id)
    on conflict do nothing;
  end if;

  perform private.caleris_refresh_owner_reputation(new.seller_member_id,'team_takeover_completed');
  perform private.caleris_refresh_owner_reputation(new.buyer_member_id,'team_takeover_completed');
  return new;
end;
$function$;

create or replace function private.caleris_owner_reputation_team_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_team_id uuid;
begin
  if tg_op='DELETE' then v_team_id:=old.team_id; else v_team_id:=new.team_id; end if;
  if tg_table_name='economy_wallet_accounts' then
    if tg_op='DELETE' then
      if old.account_kind<>'team' then return old; end if;
    elsif new.account_kind<>'team' then return new;
    end if;
  end if;
  perform private.caleris_refresh_owner_reputation_for_team(v_team_id,tg_table_name||'_'||lower(tg_op));
  if tg_op='UPDATE' then
    if old.team_id is distinct from new.team_id then
      perform private.caleris_refresh_owner_reputation_for_team(old.team_id,tg_table_name||'_previous_team');
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function private.caleris_owner_reputation_round_standing_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_team_id uuid;
begin
  if tg_op='DELETE' then
    v_team_id:=old.team_id_snapshot;
  else
    v_team_id:=new.team_id_snapshot;
  end if;
  perform private.caleris_refresh_owner_reputation_for_team(v_team_id,'round_standing_'||lower(tg_op));
  if tg_op='UPDATE' then
    if old.team_id_snapshot is distinct from new.team_id_snapshot then
      perform private.caleris_refresh_owner_reputation_for_team(old.team_id_snapshot,'round_standing_previous_team');
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function private.caleris_owner_reputation_fine_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    perform private.caleris_refresh_owner_reputation_for_team(old.target_team_id,'fine_removed');
    if old.target_member_id is not null then perform private.caleris_refresh_owner_reputation(old.target_member_id,'fine_removed'); end if;
    return old;
  end if;
  perform private.caleris_refresh_owner_reputation_for_team(new.target_team_id,'fine_issued');
  if new.target_member_id is not null then perform private.caleris_refresh_owner_reputation(new.target_member_id,'fine_issued'); end if;
  if tg_op='UPDATE' then
    if old.target_team_id is distinct from new.target_team_id then
      perform private.caleris_refresh_owner_reputation_for_team(old.target_team_id,'fine_target_changed');
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.caleris_owner_reputation_appeal_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_fine_id uuid;
  v_team_id uuid;
  v_member_id uuid;
begin
  if tg_op='DELETE' then v_fine_id:=old.fine_id; else v_fine_id:=new.fine_id; end if;
  select f.target_team_id,f.target_member_id into v_team_id,v_member_id
  from public.caleris_fines f where f.id=v_fine_id;
  if v_team_id is not null then
    perform private.caleris_refresh_owner_reputation_for_team(v_team_id,'fine_appeal_changed');
  end if;
  if v_member_id is not null then
    perform private.caleris_refresh_owner_reputation(v_member_id,'fine_appeal_changed');
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function private.caleris_owner_reputation_asset_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    perform private.caleris_refresh_owner_reputation(old.member_id,'personal_asset_removed');
    return old;
  end if;
  perform private.caleris_refresh_owner_reputation(new.member_id,'personal_asset_changed');
  if tg_op='UPDATE' then
    if old.member_id is distinct from new.member_id then
      perform private.caleris_refresh_owner_reputation(old.member_id,'personal_asset_transferred');
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.caleris_owner_reputation_catalog_asset_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_member record;
begin
  if new.market_value_eur is distinct from old.market_value_eur then
    for v_member in
      select distinct a.member_id
      from public.caleris_member_assets a
      where a.asset_code=new.asset_code
    loop
      perform private.caleris_refresh_owner_reputation(v_member.member_id,'personal_asset_valuation_changed');
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_owner_member_tenure_sync on public.members;
create trigger caleris_owner_member_tenure_sync
after insert or update of role,team_id on public.members
for each row execute function private.caleris_owner_member_tenure_sync();

drop trigger if exists caleris_owner_takeover_tenure_sync on public.caleris_team_takeovers;
create trigger caleris_owner_takeover_tenure_sync
after insert or update of status on public.caleris_team_takeovers
for each row execute function private.caleris_owner_takeover_tenure_sync();

drop trigger if exists caleris_owner_reputation_hq_event on public.caleris_team_hq_audit_logs;
create trigger caleris_owner_reputation_hq_event
after insert or update or delete on public.caleris_team_hq_audit_logs
for each row execute function private.caleris_owner_reputation_team_event();

drop trigger if exists caleris_owner_reputation_round_standing_event on public.license_round_standings;
create trigger caleris_owner_reputation_round_standing_event
after insert or update or delete on public.license_round_standings
for each row execute function private.caleris_owner_reputation_round_standing_event();

drop trigger if exists caleris_owner_reputation_standings_event on public.license_team_final_standings;
create trigger caleris_owner_reputation_standings_event
after insert or update or delete on public.license_team_final_standings
for each row execute function private.caleris_owner_reputation_team_event();

drop trigger if exists caleris_owner_reputation_contract_event on public.economy_driver_contracts;
create trigger caleris_owner_reputation_contract_event
after insert or update or delete on public.economy_driver_contracts
for each row execute function private.caleris_owner_reputation_team_event();

drop trigger if exists caleris_owner_reputation_wallet_event on public.economy_wallet_accounts;
create trigger caleris_owner_reputation_wallet_event
after insert or update or delete on public.economy_wallet_accounts
for each row execute function private.caleris_owner_reputation_team_event();

drop trigger if exists caleris_owner_reputation_loan_event on public.economy_cash_loans;
create trigger caleris_owner_reputation_loan_event
after insert or update or delete on public.economy_cash_loans
for each row execute function private.caleris_owner_reputation_team_event();

drop trigger if exists caleris_owner_reputation_fine_event on public.caleris_fines;
create trigger caleris_owner_reputation_fine_event
after insert or update or delete on public.caleris_fines
for each row execute function private.caleris_owner_reputation_fine_event();

drop trigger if exists caleris_owner_reputation_appeal_event on public.caleris_appeals;
create trigger caleris_owner_reputation_appeal_event
after insert or update or delete on public.caleris_appeals
for each row execute function private.caleris_owner_reputation_appeal_event();

drop trigger if exists caleris_owner_reputation_asset_event on public.caleris_member_assets;
create trigger caleris_owner_reputation_asset_event
after insert or update or delete on public.caleris_member_assets
for each row execute function private.caleris_owner_reputation_asset_event();

drop trigger if exists caleris_owner_reputation_catalog_event on public.caleris_assets_catalog;
create trigger caleris_owner_reputation_catalog_event
after update of market_value_eur on public.caleris_assets_catalog
for each row execute function private.caleris_owner_reputation_catalog_asset_event();

do $backfill_completed_takeovers$
declare v_take record;
begin
  for v_take in
    select x.*,
      lead(coalesce(x.settled_at,x.updated_at,x.created_at)) over(
        partition by x.target_team_id order by coalesce(x.settled_at,x.updated_at,x.created_at),x.id
      ) next_settled_at,
      row_number() over(
        partition by x.target_team_id order by coalesce(x.settled_at,x.updated_at,x.created_at),x.id
      ) position_in_team
    from public.caleris_team_takeovers x
    where x.status='completed'
  loop
    if v_take.position_in_team=1 then
      insert into public.caleris_team_owner_tenures(team_id,owner_member_id,started_at,ended_at)
      select v_take.target_team_id,v_take.seller_member_id,
        least(coalesce(t.created_at,v_take.created_at),coalesce(v_take.settled_at,v_take.updated_at,v_take.created_at)-interval '1 second'),
        coalesce(v_take.settled_at,v_take.updated_at,v_take.created_at)
      from public.teams t where t.id=v_take.target_team_id
      on conflict do nothing;
    end if;

    insert into public.caleris_team_owner_tenures(
      team_id,owner_member_id,started_at,ended_at,source_takeover_id
    )
    values(
      v_take.target_team_id,v_take.buyer_member_id,
      coalesce(v_take.settled_at,v_take.updated_at,v_take.created_at),
      case
        when v_take.next_settled_at is not null then v_take.next_settled_at
        when exists(select 1 from public.members m where m.id=v_take.buyer_member_id and m.role='Owner' and m.team_id=v_take.target_team_id) then null
        else now()
      end,
      v_take.id
    )
    on conflict do nothing;
  end loop;
end;
$backfill_completed_takeovers$;

do $backfill_owner_tenures$
declare v_team record;
begin
  for v_team in
    select t.id team_id,t.created_at,
      m.id owner_member_id
    from public.teams t
    join public.members m on m.team_id=t.id and m.role='Owner'
    where not exists(
      select 1 from public.caleris_team_owner_tenures h
      where h.team_id=t.id and h.ended_at is null
    )
  loop
    insert into public.caleris_team_owner_tenures(team_id,owner_member_id,started_at)
    values(v_team.team_id,v_team.owner_member_id,coalesce(
      (select max(coalesce(x.settled_at,x.updated_at,x.created_at))
       from public.caleris_team_takeovers x
       where x.target_team_id=v_team.team_id and x.status='completed'),
      v_team.created_at,now()
    ))
    on conflict do nothing;
  end loop;
end;
$backfill_owner_tenures$;

do $backfill_owner_reputation$
declare v_owner record;
begin
  for v_owner in
    select distinct owner_member_id from public.caleris_team_owner_tenures
    union
    select id from public.members where role='Owner' and team_id is not null
  loop
    perform private.caleris_refresh_owner_reputation(v_owner.owner_member_id,'owner_reputation_initial_backfill');
  end loop;
end;
$backfill_owner_reputation$;

revoke all on function private.caleris_owner_financial_health_score(uuid) from public,anon,authenticated;
revoke all on function private.caleris_owner_contract_stability_score(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function private.caleris_owner_team_achievement_score(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function private.caleris_owner_hq_development_score(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function private.caleris_owner_compliance_score(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function private.caleris_refresh_owner_reputation(uuid,text) from public,anon,authenticated;
revoke all on function private.caleris_refresh_owner_reputation_for_team(uuid,text) from public,anon,authenticated;
revoke all on function private.caleris_owner_member_tenure_sync() from public,anon,authenticated;
revoke all on function private.caleris_owner_takeover_tenure_sync() from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_team_event() from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_round_standing_event() from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_fine_event() from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_appeal_event() from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_asset_event() from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_catalog_asset_event() from public,anon,authenticated;

commit;
