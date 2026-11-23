begin;
create table if not exists public.caleris_team_inactivity_config (
 singleton boolean primary key default true check(singleton),
 effective_from date not null default (now() at time zone 'Asia/Jakarta')::date,
 reactivation_activity_threshold integer not null default 3 check(reactivation_activity_threshold>=1),
 updated_at timestamptz not null default now()
);
insert into public.caleris_team_inactivity_config(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists public.caleris_team_inactivity_states (
 team_id uuid primary key references public.teams(id) on delete restrict,
 status text not null default 'active' check(status in ('active','awaiting_compensation','frozen')),
 frozen_after_season_id uuid references public.license_seasons(id) on delete restrict,
 frozen_at timestamptz,
 reactivated_at timestamptz,
 reactivation_activity_count integer not null default 0,
 last_reviewed_season_id uuid references public.license_seasons(id) on delete restrict,
 updated_at timestamptz not null default now()
);
create index if not exists caleris_team_inactivity_status_idx on public.caleris_team_inactivity_states(status,updated_at desc);
create table if not exists public.caleris_team_inactivity_reviews (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.license_seasons(id) on delete restrict,
 team_id uuid not null references public.teams(id) on delete restrict,
 quest_activity_count integer not null default 0,
 development_activity_count integer not null default 0,
 freeze_triggered boolean not null default false,
 created_at timestamptz not null default now(),
 unique(season_id,team_id)
);
create table if not exists public.caleris_team_freeze_settlements (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id) on delete restrict,
 season_id uuid not null references public.license_seasons(id) on delete restrict,
 member_id uuid not null references public.members(id) on delete restrict,
 contract_term_id uuid references public.caleris_driver_contract_terms(id) on delete restrict,
 remaining_seasons integer not null check(remaining_seasons>0),
 annual_salary_snapshot numeric(20,2),
 compensation_amount numeric(20,2) not null check(compensation_amount>0),
 status text not null default 'pending' check(status in ('pending','paid')),
 transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
 error_note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(team_id,season_id,member_id)
);
create index if not exists caleris_team_freeze_settlements_pending_idx on public.caleris_team_freeze_settlements(team_id,season_id,status);
create table if not exists public.caleris_team_replacement_slots (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.license_seasons(id) on delete restrict,
 division_key text not null,
 replaced_team_id uuid not null references public.teams(id) on delete restrict,
 replacement_team_id uuid references public.teams(id) on delete restrict,
 status text not null default 'open' check(status in ('open','filled')),
 note text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 filled_at timestamptz,
 unique(season_id,replaced_team_id)
);
create unique index if not exists caleris_team_replacement_slots_one_open_division on public.caleris_team_replacement_slots(season_id,division_key) where status='open';

alter table public.caleris_team_inactivity_states enable row level security;
alter table public.caleris_team_inactivity_reviews enable row level security;
alter table public.caleris_team_freeze_settlements enable row level security;
alter table public.caleris_team_replacement_slots enable row level security;
revoke all on public.caleris_team_inactivity_states,public.caleris_team_inactivity_reviews,public.caleris_team_freeze_settlements,public.caleris_team_replacement_slots from public,anon,authenticated;
grant select on public.caleris_team_inactivity_states,public.caleris_team_inactivity_reviews,public.caleris_team_freeze_settlements,public.caleris_team_replacement_slots to authenticated;
drop policy if exists "Admins read team inactivity states" on public.caleris_team_inactivity_states;
create policy "Admins read team inactivity states" on public.caleris_team_inactivity_states for select to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
drop policy if exists "Admins read team inactivity reviews" on public.caleris_team_inactivity_reviews;
create policy "Admins read team inactivity reviews" on public.caleris_team_inactivity_reviews for select to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
drop policy if exists "Admins read team freeze settlements" on public.caleris_team_freeze_settlements;
create policy "Admins read team freeze settlements" on public.caleris_team_freeze_settlements for select to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
drop policy if exists "Admins read replacement slots" on public.caleris_team_replacement_slots;
create policy "Admins read replacement slots" on public.caleris_team_replacement_slots for select to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

alter table public.economy_transactions drop constraint if exists economy_transactions_event_type_check;
alter table public.economy_transactions add constraint economy_transactions_event_type_check
check(event_type=any(array['checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment','development_upgrade','team_hq_upgrade','merchandise_sale','merchandise_production','contract_compensation']::text[]));

CREATE OR REPLACE FUNCTION private.post_economy_transaction(p_source_account_id uuid, p_destination_account_id uuid, p_amount numeric, p_event_type text, p_description text, p_idempotency_key text, p_actor_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_reversal_of uuid DEFAULT NULL::uuid, p_allow_pending boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_source public.economy_wallet_accounts%rowtype;
 v_destination public.economy_wallet_accounts%rowtype;
 v_existing public.economy_transactions%rowtype;
 v_original public.economy_transactions%rowtype;
 v_transaction_id uuid;
begin
 if p_amount is null or p_amount<=0 or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Nominal transaksi tidak valid.'; end if;
 if p_source_account_id is null or p_destination_account_id is null or p_source_account_id=p_destination_account_id then raise exception 'Wallet tidak valid.'; end if;
 if p_event_type not in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment','development_upgrade','team_hq_upgrade','contract_compensation') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
 if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then raise exception 'Idempotency key tidak valid.'; end if;
 if p_description is null or length(trim(p_description)) not between 1 and 240 then raise exception 'Deskripsi transaksi tidak valid.'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then raise exception 'Metadata transaksi tidak valid.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
 select * into v_existing from public.economy_transactions where idempotency_key=p_idempotency_key;
 if found then
  if v_existing.source_account_id<>p_source_account_id or v_existing.destination_account_id<>p_destination_account_id or v_existing.amount<>p_amount or v_existing.event_type<>p_event_type then raise exception 'Idempotency key digunakan transaksi berbeda.'; end if;
  return jsonb_build_object('transaction_id',v_existing.id,'status','duplicate');
 end if;
 if p_event_type='reversal' then
  if p_reversal_of is null then raise exception 'Referensi reversal wajib ada.'; end if;
  select * into v_original from public.economy_transactions where id=p_reversal_of for update;
  if not found or v_original.reversal_of is not null then raise exception 'Transaksi asal tidak valid.'; end if;
  if v_original.source_account_id<>p_destination_account_id or v_original.destination_account_id<>p_source_account_id or v_original.amount<>p_amount then raise exception 'Reversal tidak cocok.'; end if;
 elsif p_reversal_of is not null then raise exception 'Referensi reversal hanya untuk reversal.';
 end if;
 perform 1 from public.economy_wallet_accounts where id in (p_source_account_id,p_destination_account_id) order by id for update;
 select * into v_source from public.economy_wallet_accounts where id=p_source_account_id;
 select * into v_destination from public.economy_wallet_accounts where id=p_destination_account_id;
 if v_source.id is null or v_destination.id is null or not v_source.is_active or not v_destination.is_active then raise exception 'Wallet tidak ditemukan atau nonaktif.'; end if;
 if p_event_type='checkin_reward' and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind not in ('driver','team_owner','public_member')) then
  raise exception 'Rute reward check-in tidak valid.';
 elsif p_event_type in ('prize','bank_reward') and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
  raise exception 'Rute reward Bank tidak valid.';
 elsif p_event_type='sponsor_payout' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
  raise exception 'Rute sponsor tidak valid.';
 elsif p_event_type='bank_funding' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind<>'vreeo_bank') then
  raise exception 'Rute funding Bank tidak valid.';
 elsif p_event_type in ('tax','fine') and (v_destination.account_kind<>'vreeo_bank' or v_source.account_kind in ('vreeo_bank','sponsor_source')) then
  raise exception 'Rute pajak/denda tidak valid.';
 elsif p_event_type='transfer' and (v_source.account_kind in ('vreeo_bank','sponsor_source') or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
  raise exception 'Rute transfer tidak valid.';
 elsif p_event_type='admin_adjustment' and (v_source.account_kind='sponsor_source' or v_destination.account_kind='sponsor_source') then
  raise exception 'Rute penyesuaian tidak valid.';
 elsif p_event_type='development_upgrade' and (v_source.account_kind not in ('driver','team') or v_destination.account_kind<>'development_shop') then
  raise exception 'Rute pembayaran Development tidak valid.';
 elsif p_event_type='team_hq_upgrade' and (v_source.account_kind<>'team' or v_destination.account_kind<>'vreeo_bank' or v_source.team_id is null or v_source.team_id is distinct from nullif(p_metadata->>'team_id','')::uuid) then
  raise exception 'Rute pembayaran Team HQ tidak valid.';
 elsif p_event_type='contract_compensation' and (
  v_source.account_kind<>'team' or v_destination.account_kind<>'driver'
  or v_source.team_id is distinct from nullif(p_metadata->>'team_id','')::uuid
  or v_destination.member_id is distinct from nullif(p_metadata->>'member_id','')::uuid
  or not (
    exists(select 1 from public.caleris_driver_contract_terms t where t.team_id=v_source.team_id and t.member_id=v_destination.member_id and t.status='active')
    or exists(select 1 from public.economy_driver_contracts c where c.team_id=v_source.team_id and c.member_id=v_destination.member_id and c.status in ('active','ended','suspended','pending_registration'))
  )
 ) then
  raise exception 'Rute kompensasi pemutusan kontrak tidak valid.';
 elsif p_event_type='payroll' and (
  v_source.account_kind<>'team' or v_destination.account_kind<>'driver' or not exists(
   select 1 from public.members m where m.id=v_destination.member_id and m.role='Driver'
    and (m.team_id=v_source.team_id or exists(
     select 1 from public.caleris_driver_move_negotiations n
     where n.id=nullif(p_metadata->>'loan_negotiation_id','')::uuid and n.driver_member_id=m.id
      and n.move_type='loan' and n.status in ('loan_active','loan_returned')
      and n.loan_season_id=nullif(p_metadata->>'season_id','')::uuid
      and v_source.team_id in (n.buyer_team_id,n.seller_team_id)
    ))
  )
 ) then raise exception 'Payroll harus berasal dari tim kontrak Driver atau salah satu tim pada Driver Loan aktif/selesai.';
 end if;
 if v_source.balance<p_amount and v_source.account_kind<>'sponsor_source' and p_event_type not in ('tax','fine') then
  if p_allow_pending then return null; end if;
  raise exception 'Saldo sumber tidak mencukupi.';
 end if;
 insert into public.economy_transactions(event_type,source_account_id,destination_account_id,amount,idempotency_key,description,metadata,created_by,reversal_of)
 values(p_event_type,p_source_account_id,p_destination_account_id,p_amount,p_idempotency_key,trim(p_description),p_metadata,p_actor_id,p_reversal_of)
 returning id into v_transaction_id;
 insert into public.economy_entries(transaction_id,account_id,entry_side,amount)
 values(v_transaction_id,p_source_account_id,'outflow',p_amount),(v_transaction_id,p_destination_account_id,'inflow',p_amount);
 update public.economy_wallet_accounts set balance=balance-p_amount,updated_at=now() where id=p_source_account_id;
 update public.economy_wallet_accounts set balance=balance+p_amount,updated_at=now() where id=p_destination_account_id;
 return jsonb_build_object('transaction_id',v_transaction_id,'status','posted');
end;
$function$

CREATE OR REPLACE FUNCTION private.release_driver_role_after_contract_end()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status is distinct from 'ended' then return new; end if;
  if exists(select 1 from public.economy_driver_contracts c where c.member_id=new.member_id and c.status='active') then return new; end if;
  if exists(select 1 from public.caleris_team_inactivity_states s where s.team_id=old.team_id and s.status='awaiting_compensation') then return new; end if;
  update public.members set role=null,team_id=null where id=new.member_id and role='Driver';
  update public.caleris_driver_move_negotiations set status='cancelled',updated_at=now()
  where driver_member_id=new.member_id and status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved','loan_active');
  return new;
end;
$function$


create or replace function private.process_team_freeze_compensation(p_team_id uuid,p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_season public.license_seasons%rowtype; v_wallet public.economy_wallet_accounts%rowtype;
 v_term record; v_contract record; v_settlement record; v_driver_wallet public.economy_wallet_accounts%rowtype;
 v_season_index integer; v_remaining integer; v_amount numeric(20,2); v_total numeric(20,2);
 v_missing_wallets integer; v_tx jsonb; v_loan_id uuid;
begin
 select * into v_season from public.license_seasons where id=p_season_id;
 if not found then raise exception 'Season pembekuan tidak ditemukan.'; end if;
 perform 1 from public.caleris_team_inactivity_states where team_id=p_team_id and status='awaiting_compensation' for update;
 if not found then return jsonb_build_object('status','not_pending'); end if;
 select * into v_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=p_team_id and is_active for update;
 if not found then return jsonb_build_object('status','pending','reason','team_wallet_missing'); end if;

 for v_term in
  select distinct on(t.member_id) t.id,t.member_id,t.annual_salary,t.duration_seasons,first_season.starts_on
  from public.caleris_driver_contract_terms t join public.license_seasons first_season on first_season.id=t.first_season_id
  where t.team_id=p_team_id and t.status='active' and first_season.starts_on<=v_season.starts_on
  order by t.member_id,first_season.starts_on desc,t.created_at desc
 loop
  select count(*) into v_season_index from public.license_seasons s where s.starts_on>=v_term.starts_on and s.starts_on<=v_season.starts_on;
  v_remaining:=greatest(0,v_term.duration_seasons-v_season_index);
  v_amount:=round(v_term.annual_salary*v_remaining,2);
  if v_remaining>0 and v_amount>0 then
   insert into public.caleris_team_freeze_settlements(team_id,season_id,member_id,contract_term_id,remaining_seasons,annual_salary_snapshot,compensation_amount,status)
   values(p_team_id,p_season_id,v_term.member_id,v_term.id,v_remaining,v_term.annual_salary,v_amount,'pending')
   on conflict(team_id,season_id,member_id) do nothing;
  end if;
 end loop;

 for v_contract in
  select c.member_id,count(*)::integer remaining_seasons,round(sum(c.annual_salary),2) compensation_amount,round(avg(c.annual_salary),2) annual_salary_snapshot
  from public.economy_driver_contracts c join public.license_seasons future_season on future_season.id=c.season_id
  where c.team_id=p_team_id and future_season.starts_on>v_season.starts_on and c.status in ('active','pending_registration','suspended')
   and not exists(select 1 from public.caleris_driver_contract_terms t where t.team_id=p_team_id and t.member_id=c.member_id and t.status='active')
  group by c.member_id
 loop
  if v_contract.remaining_seasons>0 and v_contract.compensation_amount>0 then
   insert into public.caleris_team_freeze_settlements(team_id,season_id,member_id,remaining_seasons,annual_salary_snapshot,compensation_amount,status)
   values(p_team_id,p_season_id,v_contract.member_id,v_contract.remaining_seasons,v_contract.annual_salary_snapshot,v_contract.compensation_amount,'pending')
   on conflict(team_id,season_id,member_id) do nothing;
  end if;
 end loop;

 select coalesce(sum(compensation_amount),0) into v_total from public.caleris_team_freeze_settlements where team_id=p_team_id and season_id=p_season_id and status='pending';
 select count(*) into v_missing_wallets from public.caleris_team_freeze_settlements s
 where s.team_id=p_team_id and s.season_id=p_season_id and s.status='pending'
 and not exists(select 1 from public.economy_wallet_accounts w where w.account_kind='driver' and w.member_id=s.member_id and w.is_active);
 if v_missing_wallets>0 or v_wallet.balance<v_total then
  update public.caleris_team_freeze_settlements set error_note=case when v_missing_wallets>0 then 'Driver wallet belum tersedia.' else 'Saldo Team Wallet belum mencukupi untuk membayar seluruh kompensasi.' end,updated_at=now()
  where team_id=p_team_id and season_id=p_season_id and status='pending';
  return jsonb_build_object('status','pending','required_amount',v_total,'available_amount',v_wallet.balance,'missing_driver_wallets',v_missing_wallets);
 end if;

 for v_settlement in select * from public.caleris_team_freeze_settlements where team_id=p_team_id and season_id=p_season_id and status='pending' order by member_id for update
 loop
  select * into v_driver_wallet from public.economy_wallet_accounts where account_kind='driver' and member_id=v_settlement.member_id and is_active for update;
  select n.id into v_loan_id from public.caleris_driver_move_negotiations n
  where n.driver_member_id=v_settlement.member_id and n.move_type='loan' and n.loan_season_id=p_season_id
   and n.status in ('loan_active','loan_returned') and p_team_id in (n.seller_team_id,n.buyer_team_id)
  order by n.created_at desc limit 1;
  v_tx:=private.post_economy_transaction(
   v_wallet.id,v_driver_wallet.id,v_settlement.compensation_amount,'contract_compensation',
   'Kompensasi sisa kontrak akibat pembekuan tim — '||v_season.title,
   'team-freeze-comp:'||p_team_id::text||':'||p_season_id::text||':'||v_settlement.member_id::text,
   null,jsonb_build_object('team_id',p_team_id,'member_id',v_settlement.member_id,'season_id',p_season_id,
    'remaining_seasons',v_settlement.remaining_seasons,'annual_salary',v_settlement.annual_salary_snapshot,
    'contract_term_id',v_settlement.contract_term_id,'compensation_type','team_inactivity_freeze','loan_negotiation_id',v_loan_id),null,false
  );
  update public.caleris_team_freeze_settlements set status='paid',transaction_id=(v_tx->>'transaction_id')::uuid,error_note=null,updated_at=now() where id=v_settlement.id;
 end loop;

 update public.economy_driver_contracts c set status='ended',updated_at=now()
 from public.license_seasons future_season
 where future_season.id=c.season_id and future_season.starts_on>v_season.starts_on and c.team_id=p_team_id and c.status in ('active','pending_registration','suspended');
 update public.caleris_driver_contract_terms set status='cancelled' where team_id=p_team_id and status='active';
 update public.members m set role=null,team_id=null
 where m.id in (select s.member_id from public.caleris_team_freeze_settlements s where s.team_id=p_team_id and s.season_id=p_season_id and s.status='paid')
 and m.role='Driver' and not exists(select 1 from public.economy_driver_contracts c where c.member_id=m.id and c.status in ('active','pending_registration','suspended'));
 update public.caleris_team_inactivity_states set status='frozen',updated_at=now() where team_id=p_team_id and status='awaiting_compensation';
 perform private.refresh_team_reactivation(p_team_id);
 return jsonb_build_object('status','frozen','compensation_total',v_total,'drivers_compensated',(select count(*) from public.caleris_team_freeze_settlements where team_id=p_team_id and season_id=p_season_id and status='paid'));
end;
$$;
revoke all on function private.process_team_freeze_compensation(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.evaluate_team_inactivity(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_season public.license_seasons%rowtype;v_team record;v_quests integer;v_development integer;v_freeze_count integer:=0;
begin
 select * into v_season from public.license_seasons where id=p_season_id;
 if not found or v_season.ends_on<(select effective_from from public.caleris_team_inactivity_config where singleton=true) then return jsonb_build_object('evaluated',false,'reason','outside_effective_period'); end if;
 for v_team in select t.id team_id from public.license_season_team_snapshots ts join public.teams t on t.id=ts.team_id where ts.season_id=p_season_id
 loop
  select count(*) into v_quests from public.caleris_quest_assignments q
  where q.team_id=v_team.team_id and q.completed_at is not null and q.completed_at>=v_season.starts_on::timestamptz
   and q.completed_at<(v_season.ends_on+1)::timestamptz and (q.season_id=p_season_id or q.season_id is null);
  select count(*) into v_development from public.caleris_team_development_part_history h
  where h.team_id=v_team.team_id and h.created_at>=v_season.starts_on::timestamptz and h.created_at<(v_season.ends_on+1)::timestamptz;
  insert into public.caleris_team_inactivity_reviews(season_id,team_id,quest_activity_count,development_activity_count,freeze_triggered)
  values(p_season_id,v_team.team_id,v_quests,v_development,(v_quests+v_development)=0) on conflict(season_id,team_id) do nothing;
  if v_quests+v_development=0 then
   insert into public.caleris_team_inactivity_states(team_id,status,frozen_after_season_id,frozen_at,last_reviewed_season_id,updated_at)
   values(v_team.team_id,'awaiting_compensation',p_season_id,now(),p_season_id,now())
   on conflict(team_id) do update set
    status=case when public.caleris_team_inactivity_states.status='frozen' then 'frozen' else 'awaiting_compensation' end,
    frozen_after_season_id=case when public.caleris_team_inactivity_states.status='frozen' then public.caleris_team_inactivity_states.frozen_after_season_id else excluded.frozen_after_season_id end,
    frozen_at=case when public.caleris_team_inactivity_states.status='frozen' then public.caleris_team_inactivity_states.frozen_at else coalesce(public.caleris_team_inactivity_states.frozen_at,excluded.frozen_at) end,
    last_reviewed_season_id=excluded.last_reviewed_season_id,updated_at=now();
   perform private.process_team_freeze_compensation(v_team.team_id,p_season_id);
   v_freeze_count:=v_freeze_count+1;
  else
   insert into public.caleris_team_inactivity_states(team_id,status,last_reviewed_season_id,updated_at) values(v_team.team_id,'active',p_season_id,now())
   on conflict(team_id) do update set last_reviewed_season_id=excluded.last_reviewed_season_id,updated_at=now();
  end if;
 end loop;
 return jsonb_build_object('evaluated',true,'season_id',p_season_id,'teams_reviewed',(select count(*) from public.caleris_team_inactivity_reviews where season_id=p_season_id),'freeze_candidates',v_freeze_count);
end;
$$;
revoke all on function private.evaluate_team_inactivity(uuid) from public,anon,authenticated,service_role;

create or replace function private.refresh_team_reactivation(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_state public.caleris_team_inactivity_states%rowtype;v_required integer;v_count integer;
begin
 select * into v_state from public.caleris_team_inactivity_states where team_id=p_team_id and status='frozen' for update;
 if not found then return jsonb_build_object('status','unchanged'); end if;
 select reactivation_activity_threshold into v_required from public.caleris_team_inactivity_config where singleton=true;
 select count(*) into v_count from (
  select q.id from public.caleris_quest_assignments q where q.team_id=p_team_id and q.completed_at>=v_state.frozen_at and q.status='completed'
  union all
  select h.id from public.caleris_team_development_part_history h where h.team_id=p_team_id and h.created_at>=v_state.frozen_at
 ) activities;
 if v_count>=v_required then
  update public.caleris_team_inactivity_states set status='active',reactivated_at=now(),reactivation_activity_count=v_count,updated_at=now() where team_id=p_team_id and status='frozen';
  return jsonb_build_object('status','reactivated','activity_count',v_count);
 end if;
 update public.caleris_team_inactivity_states set reactivation_activity_count=v_count,updated_at=now() where team_id=p_team_id;
 return jsonb_build_object('status','frozen','activity_count',v_count,'required',v_required);
end;
$$;
revoke all on function private.refresh_team_reactivation(uuid) from public,anon,authenticated,service_role;
create or replace function private.track_team_reactivation_activity()
returns trigger language plpgsql security definer set search_path='' as $$ begin if new.team_id is not null then perform private.refresh_team_reactivation(new.team_id); end if; return new; end; $$;
revoke all on function private.track_team_reactivation_activity() from public,anon,authenticated,service_role;
drop trigger if exists caleris_team_inactivity_quest_reactivation on public.caleris_quest_assignments;
create trigger caleris_team_inactivity_quest_reactivation after insert or update of completed_at,status on public.caleris_quest_assignments
for each row when(new.completed_at is not null and new.status='completed') execute function private.track_team_reactivation_activity();
drop trigger if exists caleris_team_inactivity_development_reactivation on public.caleris_team_development_part_history;
create trigger caleris_team_inactivity_development_reactivation after insert on public.caleris_team_development_part_history for each row execute function private.track_team_reactivation_activity();

create or replace function public.admin_open_team_replacement_slot(p_frozen_team_id uuid,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_season_id uuid;v_division text;v_slot_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat membuka slot pengganti.'; end if;
 if not exists(select 1 from public.caleris_team_inactivity_states where team_id=p_frozen_team_id and status='frozen') then raise exception 'Tim harus berstatus Frozen dan kompensasi harus selesai.'; end if;
 select division_key into v_division from public.teams where id=p_frozen_team_id;
 if v_division is null then raise exception 'Divisi tim yang dibekukan belum ditetapkan.'; end if;
 select id into v_season_id from public.license_seasons where status='draft'
  and starts_on>(select ends_on from public.license_seasons where id=(select frozen_after_season_id from public.caleris_team_inactivity_states where team_id=p_frozen_team_id))
  order by starts_on limit 1;
 if v_season_id is null then raise exception 'Belum ada season draft berikutnya untuk slot pengganti.'; end if;
 insert into public.caleris_team_replacement_slots(season_id,division_key,replaced_team_id,note,created_by)
 values(v_season_id,v_division,p_frozen_team_id,nullif(trim(p_note),''),(select auth.uid()))
 on conflict(season_id,replaced_team_id) do update set note=excluded.note returning id into v_slot_id;
 return v_slot_id;
end;
$$;
revoke all on function public.admin_open_team_replacement_slot(uuid,text) from public,anon;
grant execute on function public.admin_open_team_replacement_slot(uuid,text) to authenticated;

create or replace function public.admin_fill_team_replacement_slot(p_slot_id uuid,p_replacement_team_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_slot public.caleris_team_replacement_slots%rowtype;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat mengisi slot pengganti.'; end if;
 select * into v_slot from public.caleris_team_replacement_slots where id=p_slot_id and status='open' for update;
 if not found then raise exception 'Slot tidak ditemukan atau sudah terisi.'; end if;
 if p_replacement_team_id is null or p_replacement_team_id=v_slot.replaced_team_id then raise exception 'Tim pengganti tidak valid.'; end if;
 if not exists(select 1 from public.teams where id=p_replacement_team_id) then raise exception 'Tim pengganti tidak ditemukan.'; end if;
 if exists(select 1 from public.caleris_team_inactivity_states where team_id=p_replacement_team_id and status in ('frozen','awaiting_compensation')) then raise exception 'Tim pengganti sedang dibekukan.'; end if;
 if exists(select 1 from public.license_season_team_snapshots where season_id=v_slot.season_id and team_id=p_replacement_team_id) then raise exception 'Tim sudah terdaftar pada season tujuan.'; end if;
 update public.teams set division_key=v_slot.division_key where id=p_replacement_team_id;
 update public.caleris_team_replacement_slots set replacement_team_id=p_replacement_team_id,status='filled',filled_at=now() where id=v_slot.id;
 return jsonb_build_object('slot_id',v_slot.id,'replacement_team_id',p_replacement_team_id,'status','filled');
end;
$$;
revoke all on function public.admin_fill_team_replacement_slot(uuid,uuid) from public,anon;
grant execute on function public.admin_fill_team_replacement_slot(uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.season_driver_effective_team(p_season_id uuid, p_member_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when loan.buyer_team_id is not null then loan.buyer_team_id else m.team_id end
  from public.members m
  join public.license_seasons s on s.id=p_season_id
  join public.economy_driver_contracts c
    on c.season_id=s.id and c.member_id=m.id and c.status='active'
  left join lateral (
    select n.buyer_team_id
    from public.caleris_driver_move_negotiations n
    where n.driver_member_id=m.id
      and n.move_type='loan'
      and n.loan_season_id=s.id
      and n.seller_team_id=c.team_id
      and n.status in ('approved_waiting_window','loan_active')
      and n.loan_starts_on=s.starts_on
      and n.loan_ends_on=s.ends_on
      and (
        (n.status='approved_waiting_window' and m.team_id=n.seller_team_id)
        or (n.status='loan_active' and m.team_id=n.buyer_team_id)
      )
    order by n.created_at desc
    limit 1
  ) loan on true
  where m.id=p_member_id
    and m.role='Driver'
    and not exists(select 1 from public.caleris_team_inactivity_states frozen where frozen.team_id=case when loan.buyer_team_id is not null then loan.buyer_team_id else m.team_id end and frozen.status in ('frozen','awaiting_compensation'))
    and (
      c.team_id=m.team_id
      or loan.buyer_team_id is not null
    )
  order by c.created_at desc
  limit 1;
$function$;
CREATE OR REPLACE FUNCTION private.sync_season_roster(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season public.license_seasons%rowtype;
  v_division record;
  v_driver_count integer;
  v_roster_count integer:=0;
  v_team_count integer:=0;
  v_period_count integer;
  v_race_period_count integer;
  v_break_count integer;
  v_unmapped integer;
begin
  select * into v_season
  from public.license_seasons
  where id=p_season_id
  for update;

  if not found or v_season.status<>'draft' then
    return jsonb_build_object('ready',false,'reason','target_season_not_draft');
  end if;

  select count(*) into v_period_count
  from public.season_calendar_periods where season_id=p_season_id;
  if not exists(select 1 from public.license_season_divisions where season_id=p_season_id) then
    return jsonb_build_object('ready',false,'reason','season_has_no_divisions');
  end if;
  select count(*) into v_race_period_count
  from public.season_calendar_periods where season_id=p_season_id and period_type='race_period';
  select count(*) into v_break_count
  from public.season_calendar_periods where season_id=p_season_id and period_type='race_break';

  if v_period_count<>12 or v_race_period_count<>5 or v_break_count<>4
    or not exists(select 1 from public.season_calendar_periods where season_id=p_season_id and period_type='pre_season')
    or not exists(select 1 from public.season_calendar_periods where season_id=p_season_id and period_type='end_season')
    or not exists(select 1 from public.season_calendar_periods where season_id=p_season_id and period_type='off_season') then
    return jsonb_build_object('ready',false,'reason','calendar_not_complete');
  end if;

  if (select array_agg(period_type order by sort_order) from public.season_calendar_periods where season_id=p_season_id)
    is distinct from array['pre_season','race_period','race_break','race_period','race_break','race_period','race_break','race_period','race_break','race_period','end_season','off_season']::text[] then
    return jsonb_build_object('ready',false,'reason','calendar_period_sequence_invalid');
  end if;

  if exists(
    select 1 from (
      select starts_on,lag(ends_on) over(order by sort_order) as previous_end
      from public.season_calendar_periods where season_id=p_season_id
    ) dates
    where previous_end is not null and starts_on<>previous_end+1
  ) then
    return jsonb_build_object('ready',false,'reason','calendar_dates_not_contiguous');
  end if;

  if exists(
    select 1
    from public.license_season_divisions d
    where d.season_id=p_season_id
      and (
        (select count(*) from public.season_calendar_periods p where p.season_id=p_season_id and p.period_type='race_period')<>5
        or exists(
          select 1 from public.season_calendar_periods p
          where p.season_id=p_season_id and p.period_type='race_period'
            and (select count(*) from public.season_period_rounds pr where pr.period_id=p.id and pr.season_division_id=d.id) not between 3 and 5
        )
      )
  ) then
    return jsonb_build_object('ready',false,'reason','race_period_round_count_invalid');
  end if;

  select count(*) into v_unmapped
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  where d.season_id=p_season_id
    and not exists(select 1 from public.season_period_rounds pr where pr.round_id=r.id);
  if v_unmapped>0 then
    return jsonb_build_object('ready',false,'reason','rounds_not_mapped');
  end if;

  -- A transfer approved for the window must finish before the new roster is frozen.
  if exists(
    select 1 from public.caleris_driver_move_negotiations n
    where n.move_type='transfer'
      and n.status in ('approved','approved_waiting_window')
  ) then
    return jsonb_build_object('ready',false,'reason','approved_transfers_pending_execution');
  end if;

  for v_division in
    select d.id,d.division_key
    from public.license_season_divisions d
    where d.season_id=p_season_id
    order by d.division_key
  loop
    select count(*) into v_driver_count
    from public.members m
    where m.role='Driver'
      and private.season_driver_effective_team(p_season_id,m.id) is not null
      and exists(
        select 1 from public.teams t
        where t.id=private.season_driver_effective_team(p_season_id,m.id)
          and lower(t.division_key)=lower(v_division.division_key)
      );
    if v_driver_count=0 then
      return jsonb_build_object('ready',false,'reason','division_has_no_active_contracted_drivers','division_key',v_division.division_key);
    end if;
  end loop;

  -- Keep existing draft registration rows for audit; mark non-eligible rows as
  -- inactive rather than deleting them.
  update public.license_season_members sm
  set is_hiatus=true
  where sm.season_id=p_season_id
    and not exists(
      select 1
      from public.members m
      where m.id=sm.member_id and m.role='Driver'
        and private.season_driver_effective_team(p_season_id,m.id) is not null
        and exists(
          select 1 from public.teams t
          join public.license_season_divisions d
            on d.season_id=p_season_id and lower(d.division_key)=lower(t.division_key)
          where t.id=private.season_driver_effective_team(p_season_id,m.id)
            and d.id=sm.season_division_id
        )
    );

  insert into public.license_season_members(
    season_id,season_division_id,member_id,is_hiatus,preserved_license
  )
  select p_season_id,d.id,m.id,false,m.license
  from public.members m
  join public.teams t on t.id=private.season_driver_effective_team(p_season_id,m.id)
  join public.license_season_divisions d
    on d.season_id=p_season_id and lower(d.division_key)=lower(t.division_key)
  where m.role='Driver'
  on conflict(member_id,season_id) do update
    set season_division_id=excluded.season_division_id,
        is_hiatus=false,
        preserved_license=coalesce(excluded.preserved_license,public.license_season_members.preserved_license);

  insert into public.license_season_team_snapshots(season_id,season_division_id,team_id,team_name_snapshot)
  select p_season_id,d.id,t.id,t.name
  from public.license_season_divisions d
  join public.teams t on lower(t.division_key)=lower(d.division_key)
  where d.season_id=p_season_id
    and not exists(select 1 from public.caleris_team_inactivity_states frozen where frozen.team_id=t.id and frozen.status in ('frozen','awaiting_compensation'))
  on conflict(season_id,team_id) do nothing;

  insert into public.license_season_roster_snapshots(
    season_id,season_division_id,member_id,team_id,contract_id,
    driver_name_snapshot,team_name_snapshot,annual_salary_snapshot
  )
  select p_season_id,d.id,m.id,t.id,c.id,
    coalesce(m.character_name,'Driver'),t.name,c.annual_salary
  from public.members m
  join public.teams t on t.id=private.season_driver_effective_team(p_season_id,m.id)
  join public.license_season_divisions d
    on d.season_id=p_season_id and lower(d.division_key)=lower(t.division_key)
  join public.economy_driver_contracts c
    on c.season_id=p_season_id and c.member_id=m.id and c.status='active'
  where m.role='Driver'
    and (
      c.team_id=t.id
      or exists(
        select 1 from public.caleris_driver_move_negotiations n
        where n.driver_member_id=m.id and n.move_type='loan'
          and n.loan_season_id=p_season_id and n.seller_team_id=c.team_id
          and n.buyer_team_id=t.id and n.status in ('approved_waiting_window','loan_active')
          and n.loan_starts_on=v_season.starts_on and n.loan_ends_on=v_season.ends_on
      )
    )
  on conflict(season_id,member_id) do nothing;

  select count(*) into v_roster_count
  from public.license_season_roster_snapshots where season_id=p_season_id;

  -- Seed the new championship tables with zero points. The prior season's
  -- standings and race results remain untouched under their original IDs.
  insert into public.license_round_standings(
    round_id,member_id,points_total,driver_name_snapshot,team_id_snapshot,team_name_snapshot
  )
  select r.id,s.member_id,0,s.driver_name_snapshot,s.team_id,s.team_name_snapshot
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  join public.license_season_roster_snapshots s on s.season_division_id=d.id
  where d.season_id=p_season_id
  on conflict(round_id,member_id) do nothing;

  insert into public.license_final_standings(
    season_division_id,member_id,final_points,final_position,
    driver_name_snapshot,team_id_snapshot,team_name_snapshot
  )
  select s.season_division_id,s.member_id,0,
    row_number() over(partition by s.season_division_id order by s.driver_name_snapshot,s.member_id)::integer,
    s.driver_name_snapshot,s.team_id,s.team_name_snapshot
  from public.license_season_roster_snapshots s
  where s.season_id=p_season_id
  on conflict(season_division_id,member_id) do nothing;

  insert into public.license_team_final_standings(
    season_division_id,team_id,final_points,final_position,team_name_snapshot
  )
  select d.id,t.id,0,
    row_number() over(partition by d.id order by t.name,t.id)::integer,
    t.name
  from public.license_season_divisions d
  join public.teams t on lower(t.division_key)=lower(d.division_key)
  where d.season_id=p_season_id
    and not exists(select 1 from public.caleris_team_inactivity_states frozen where frozen.team_id=t.id and frozen.status in ('frozen','awaiting_compensation'))
  on conflict(season_division_id,team_id) do nothing;

  select count(*) into v_team_count
  from public.license_team_final_standings fs
  join public.license_season_divisions d on d.id=fs.season_division_id
  where d.season_id=p_season_id;

  return jsonb_build_object(
    'ready',true,'season_id',p_season_id,
    'drivers_snapshotted',v_roster_count,'teams_in_standings',v_team_count,
    'round_standing_rows',(select count(*) from public.license_round_standings rs
      join public.license_rounds r on r.id=rs.round_id
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season_id)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.process_season_lifecycle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_completed integer:=0;
  v_contracts_ended integer:=0;
  v_activated integer:=0;
  v_candidate uuid;
  v_candidates integer;
  v_roster jsonb;
  v_review_season_id uuid;
  v_pending_team record;
begin
  for v_review_season_id in
    select s.id from public.license_seasons s
    where s.status='active'
      and s.ends_on >= (select effective_from from public.caleris_team_inactivity_config where singleton=true)
      and exists(select 1 from public.season_calendar_periods p where p.season_id=s.id and p.period_type='end_season' and v_today between p.starts_on and p.ends_on)
      and exists(select 1 from public.license_season_divisions d where d.season_id=s.id)
      and not exists(select 1 from public.license_season_divisions d where d.season_id=s.id and d.status<>'completed')
  loop
    perform private.evaluate_team_inactivity(v_review_season_id);
  end loop;
  with completed_seasons as (
    update public.license_seasons s
    set status='completed'
    where s.status='active'
      and exists(
        select 1 from public.season_calendar_periods p
        where p.season_id=s.id and p.period_type='end_season'
          and v_today between p.starts_on and p.ends_on
      )
      and exists(select 1 from public.license_season_divisions d where d.season_id=s.id)
      and not exists(
        select 1 from public.license_season_divisions d
        where d.season_id=s.id and d.status<>'completed'
      )
    returning s.id
  ), ended_contracts as (
    update public.economy_driver_contracts c
    set status='ended',updated_at=now()
    where c.status='active' and c.season_id in (select id from completed_seasons)
    returning c.id
  )
  select (select count(*) from completed_seasons),
         (select count(*) from ended_contracts)
  into v_completed,v_contracts_ended;

  for v_pending_team in select team_id,frozen_after_season_id from public.caleris_team_inactivity_states where status='awaiting_compensation' loop
    perform private.process_team_freeze_compensation(v_pending_team.team_id,v_pending_team.frozen_after_season_id);
  end loop;

  if not exists(select 1 from public.license_seasons where status='active') then
    select count(*),(array_agg(next_season.id order by next_season.starts_on,next_season.created_at))[1]
    into v_candidates,v_candidate
    from public.license_seasons next_season
    where next_season.status='draft'
      and next_season.starts_on<=v_today
      and (select count(*) from public.season_calendar_periods p where p.season_id=next_season.id)=12
      and (
        not exists(select 1 from public.license_seasons prior where prior.status='completed')
        or exists(
          select 1
          from public.license_seasons previous_season
          join public.season_calendar_periods off_period
            on off_period.season_id=previous_season.id and off_period.period_type='off_season'
          where previous_season.status='completed'
            and next_season.starts_on=off_period.ends_on+1
            and v_today>off_period.ends_on
        )
      );

    if v_candidates=1 then
      v_roster:=private.sync_season_roster(v_candidate);
      if coalesce((v_roster->>'ready')::boolean,false) then
        update public.license_seasons set status='active'
        where id=v_candidate and status='draft';
        if found then
          update public.license_season_divisions set status='active'
          where season_id=v_candidate and status='draft';
          v_activated:=1;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'today',v_today,'seasons_completed',v_completed,'contracts_ended',v_contracts_ended,
    'seasons_activated',v_activated,'roster_sync',v_roster
  );
end;
$function$;
commit;