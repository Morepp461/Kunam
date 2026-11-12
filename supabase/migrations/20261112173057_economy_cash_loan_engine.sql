-- CALERIS Cash Loan Engine
create table public.economy_cash_loan_interest_rates (
  tenor_seasons integer primary key check(tenor_seasons between 1 and 4),
  total_interest_rate numeric(6,3) not null check(total_interest_rate between 0 and 100),
  created_at timestamptz not null default now()
);
insert into public.economy_cash_loan_interest_rates(tenor_seasons,total_interest_rate)
values(1,5),(2,10),(3,16),(4,24)
on conflict(tenor_seasons) do update set total_interest_rate=excluded.total_interest_rate;

create table public.economy_cash_loans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  profile_user_id uuid not null references auth.users(id) on delete restrict,
  wallet_id uuid not null references public.economy_wallet_accounts(id) on delete restrict,
  origin_season_id uuid not null references public.license_seasons(id) on delete restrict,
  principal numeric(20,2) not null check(principal>0),
  tenor_seasons integer not null check(tenor_seasons between 1 and 4),
  total_interest_rate numeric(6,3) not null check(total_interest_rate between 0 and 100),
  interest_amount numeric(20,2) not null check(interest_amount>=0),
  total_due numeric(20,2) not null check(total_due>=principal),
  amount_repaid numeric(20,2) not null default 0 check(amount_repaid>=0 and amount_repaid<=total_due),
  status text not null default 'active' check(status in ('active','overdue','paid')),
  disbursement_transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint economy_cash_loan_total_check check(total_due=principal+interest_amount)
);
create unique index economy_cash_loan_one_open_per_member on public.economy_cash_loans(member_id) where status in ('active','overdue');
create index economy_cash_loans_member_created_idx on public.economy_cash_loans(member_id,created_at desc);

create table public.economy_cash_loan_installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.economy_cash_loans(id) on delete restrict,
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  period_id uuid not null references public.season_calendar_periods(id) on delete restrict,
  due_amount numeric(20,2) not null check(due_amount>0),
  status text not null default 'overdue' check(status in ('paid','overdue')),
  transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  attempted_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(loan_id,period_id),
  constraint economy_cash_loan_installment_payment_shape check((status='paid')=(transaction_id is not null))
);
create index economy_cash_loan_installments_loan_idx on public.economy_cash_loan_installments(loan_id,attempted_at);

alter table public.economy_cash_loan_interest_rates enable row level security;
alter table public.economy_cash_loans enable row level security;
alter table public.economy_cash_loan_installments enable row level security;
revoke all on public.economy_cash_loan_interest_rates,public.economy_cash_loans,public.economy_cash_loan_installments from public,anon,authenticated,service_role;
grant select on public.economy_cash_loan_interest_rates,public.economy_cash_loans,public.economy_cash_loan_installments to authenticated;
create policy "Authenticated members read cash loan rates" on public.economy_cash_loan_interest_rates for select to authenticated using(true);
create policy "Members and Admin read cash loans" on public.economy_cash_loans for select to authenticated using(
 exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) or profile_user_id=(select auth.uid())
);
create policy "Members and Admin read own loan installments" on public.economy_cash_loan_installments for select to authenticated using(
 exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 or exists(select 1 from public.economy_cash_loans l where l.id=economy_cash_loan_installments.loan_id and l.profile_user_id=(select auth.uid()))
);

alter table public.economy_transactions drop constraint if exists economy_transactions_event_type_check;
alter table public.economy_transactions add constraint economy_transactions_event_type_check
check(event_type in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment'));

create or replace function private.post_cash_loan_transaction(
 p_source_wallet uuid,p_destination_wallet uuid,p_amount numeric,p_event_type text,
 p_description text,p_idempotency_key text,p_actor_id uuid,p_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_source public.economy_wallet_accounts%rowtype;
 v_destination public.economy_wallet_accounts%rowtype;
 v_existing public.economy_transactions%rowtype;
 v_transaction_id uuid;
begin
 if p_event_type not in ('loan_disbursement','loan_repayment') then raise exception 'Jenis transaksi pinjaman tidak valid.'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal pinjaman tidak valid.'; end if;
 if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 180 then raise exception 'Idempotency key tidak valid.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
 select * into v_existing from public.economy_transactions where idempotency_key=p_idempotency_key;
 if found then
  if v_existing.source_account_id<>p_source_wallet or v_existing.destination_account_id<>p_destination_wallet or v_existing.amount<>p_amount or v_existing.event_type<>p_event_type then raise exception 'Idempotency key digunakan transaksi berbeda.'; end if;
  return jsonb_build_object('transaction_id',v_existing.id,'status','duplicate');
 end if;
 perform 1 from public.economy_wallet_accounts where id in (p_source_wallet,p_destination_wallet) order by id for update;
 select * into v_source from public.economy_wallet_accounts where id=p_source_wallet;
 select * into v_destination from public.economy_wallet_accounts where id=p_destination_wallet;
 if v_source.id is null or v_destination.id is null or not v_source.is_active or not v_destination.is_active then raise exception 'Wallet pinjaman tidak tersedia.'; end if;
 if p_event_type='loan_disbursement' then
  if v_source.account_kind<>'vreeo_bank' or v_destination.account_kind not in ('public_member','driver','team_owner') then raise exception 'Pencairan pinjaman harus berasal dari VreeoBank ke wallet member.'; end if;
 else
  if v_destination.account_kind<>'vreeo_bank' or v_source.account_kind not in ('public_member','driver','team_owner') then raise exception 'Angsuran pinjaman harus masuk ke VreeoBank.'; end if;
 end if;
 if v_source.balance<p_amount then raise exception 'Saldo wallet sumber tidak mencukupi.'; end if;
 insert into public.economy_transactions(event_type,source_account_id,destination_account_id,amount,idempotency_key,description,metadata,created_by)
 values(p_event_type,p_source_wallet,p_destination_wallet,p_amount,p_idempotency_key,p_description,p_metadata,p_actor_id)
 returning id into v_transaction_id;
 insert into public.economy_entries(transaction_id,account_id,entry_side,amount)
 values(v_transaction_id,p_source_wallet,'outflow',p_amount),(v_transaction_id,p_destination_wallet,'inflow',p_amount);
 update public.economy_wallet_accounts set balance=balance-p_amount,updated_at=now() where id=p_source_wallet;
 update public.economy_wallet_accounts set balance=balance+p_amount,updated_at=now() where id=p_destination_wallet;
 return jsonb_build_object('transaction_id',v_transaction_id,'status','posted');
end;
$$;

create or replace function public.member_cash_loan_preview(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_profile public.profiles%rowtype;v_member public.members%rowtype;v_season public.license_seasons%rowtype;
 v_income numeric(20,2);v_wallet uuid;v_open boolean;v_periods integer;
begin
 select * into v_profile from public.profiles where user_id=p_actor_id;
 if not found or v_profile.member_id is null then raise exception 'Akun belum terhubung dengan member CALERIS.'; end if;
 select * into v_member from public.members where id=v_profile.member_id;
 select * into v_season from public.license_seasons where status='active' order by starts_on desc limit 1;
 if not found then raise exception 'Belum ada season aktif.'; end if;
 if v_member.role='Driver' then
  select id into v_wallet from public.economy_wallet_accounts where account_kind='driver' and member_id=v_member.id and is_active;
 elsif v_member.role='Owner' then
  select id into v_wallet from public.economy_wallet_accounts where account_kind='team_owner' and member_id=v_member.id and is_active;
 else
  select id into v_wallet from public.economy_wallet_accounts where account_kind='public_member' and profile_user_id=p_actor_id and is_active;
 end if;
 if v_wallet is null then raise exception 'Wallet member belum tersedia.'; end if;
 select coalesce(sum(e.amount),0) into v_income
 from public.economy_entries e join public.economy_transactions t on t.id=e.transaction_id
 where e.entry_side='inflow'
 and e.account_id in (select w.id from public.economy_wallet_accounts w where w.member_id=v_member.id or w.profile_user_id=p_actor_id)
 and t.created_at>=v_season.starts_on::timestamptz and t.created_at<(v_season.ends_on+1)::timestamptz
 and t.event_type in ('payroll','checkin_reward','bank_reward','sponsor_payout');
 select exists(select 1 from public.economy_cash_loans l where l.member_id=v_member.id and l.status in ('active','overdue')) into v_open;
 select count(*) into v_periods from public.season_calendar_periods p where p.season_id=v_season.id and p.period_type='race_period';
 return jsonb_build_object('member_id',v_member.id,'season_id',v_season.id,'season_title',v_season.title,'wallet_id',v_wallet,
  'season_income',v_income,'max_loan',round(v_income*5,2),'has_open_loan',v_open,'race_period_count',v_periods,
  'interest_rates',(select jsonb_agg(jsonb_build_object('tenor_seasons',r.tenor_seasons,'total_interest_rate',r.total_interest_rate) order by r.tenor_seasons) from public.economy_cash_loan_interest_rates r));
end;
$$;

create or replace function public.member_apply_cash_loan(p_actor_id uuid,p_amount numeric,p_tenor_seasons integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_preview jsonb;v_member_id uuid;v_season_id uuid;v_wallet uuid;v_rate numeric(6,3);
 v_interest numeric(20,2);v_total numeric(20,2);v_periods integer;v_bank uuid;v_loan_id uuid;v_tx jsonb;
begin
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal pinjaman harus positif dengan maksimal dua desimal.'; end if;
 if p_tenor_seasons not between 1 and 4 then raise exception 'Tenor pinjaman hanya 1 sampai 4 season.'; end if;
 v_preview:=public.member_cash_loan_preview(p_actor_id);
 if coalesce((v_preview->>'has_open_loan')::boolean,false) then raise exception 'Pinjaman sebelumnya harus lunas sebelum mengajukan pinjaman baru.'; end if;
 v_member_id:=(v_preview->>'member_id')::uuid;v_season_id:=(v_preview->>'season_id')::uuid;v_wallet:=(v_preview->>'wallet_id')::uuid;
 if p_amount>(v_preview->>'max_loan')::numeric then raise exception 'Nominal melebihi batas 5 kali income season berjalan.'; end if;
 select total_interest_rate into v_rate from public.economy_cash_loan_interest_rates where tenor_seasons=p_tenor_seasons;
 if v_rate is null then raise exception 'Tabel bunga tenor belum tersedia.'; end if;
 v_periods:=(v_preview->>'race_period_count')::integer;
 if v_periods<1 then raise exception 'Season aktif belum memiliki Race Period.'; end if;
 v_interest:=round(p_amount*v_rate/100,2);v_total:=p_amount+v_interest;
 select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active for update;
 if v_bank is null then raise exception 'Wallet VreeoBank tidak tersedia.'; end if;
 v_loan_id:=gen_random_uuid();
 insert into public.economy_cash_loans(id,member_id,profile_user_id,wallet_id,origin_season_id,principal,tenor_seasons,total_interest_rate,interest_amount,total_due)
 values(v_loan_id,v_member_id,p_actor_id,v_wallet,v_season_id,p_amount,p_tenor_seasons,v_rate,v_interest,v_total);
 v_tx:=private.post_cash_loan_transaction(v_bank,v_wallet,p_amount,'loan_disbursement','Cash Loan · '||p_tenor_seasons||' Season',
  'cash-loan-disbursement:'||v_loan_id::text,p_actor_id,jsonb_build_object('loan_id',v_loan_id,'season_id',v_season_id,'tenor_seasons',p_tenor_seasons,'interest_rate',v_rate));
 update public.economy_cash_loans set disbursement_transaction_id=(v_tx->>'transaction_id')::uuid where id=v_loan_id;
 return jsonb_build_object('loan_id',v_loan_id,'principal',p_amount,'interest_rate',v_rate,'interest_amount',v_interest,'total_due',v_total,'status','active');
end;
$$;

create or replace function private.process_cash_loan_repayments(p_period_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_period public.season_calendar_periods%rowtype;v_origin public.license_seasons%rowtype;v_current public.license_seasons%rowtype;
 v_loan public.economy_cash_loans%rowtype;v_bank uuid;v_balance numeric(20,2);v_remaining numeric(20,2);
 v_origin_periods integer;v_remaining_periods integer;v_seasons_elapsed integer;v_installments_left integer;
 v_due numeric(20,2);v_tx jsonb;v_installment uuid;v_paid integer:=0;v_overdue integer:=0;
begin
 select * into v_period from public.season_calendar_periods where id=p_period_id and period_type='race_period';
 if not found then return jsonb_build_object('paid',0,'overdue',0); end if;
 select * into v_current from public.license_seasons where id=v_period.season_id;
 select count(*) into v_remaining_periods from public.season_calendar_periods where season_id=v_period.season_id and period_type='race_period' and sort_order>=v_period.sort_order;
 select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active;
 for v_loan in select * from public.economy_cash_loans where status in ('active','overdue') order by created_at,id for update skip locked loop
  if exists(select 1 from public.economy_cash_loan_installments i where i.loan_id=v_loan.id and i.period_id=p_period_id) then continue; end if;
  select * into v_origin from public.license_seasons where id=v_loan.origin_season_id;
  select count(*)-1 into v_seasons_elapsed from public.license_seasons s where s.created_at>=v_origin.created_at and s.created_at<=v_current.created_at;
  select count(*) into v_origin_periods from public.season_calendar_periods p where p.season_id=v_loan.origin_season_id and p.period_type='race_period';
  v_installments_left:=greatest(v_origin_periods*v_loan.tenor_seasons-(select count(*) from public.economy_cash_loan_installments i where i.loan_id=v_loan.id),1);
  v_remaining:=v_loan.total_due-v_loan.amount_repaid;
  if v_remaining<=0 then update public.economy_cash_loans set status='paid',paid_at=coalesce(paid_at,now()) where id=v_loan.id;continue;end if;
  if coalesce(v_seasons_elapsed,0)>=v_loan.tenor_seasons-1 and v_period.sort_order=(select max(p.sort_order) from public.season_calendar_periods p where p.season_id=v_period.season_id and p.period_type='race_period') then
   v_due:=v_remaining;
  else
   v_due:=greatest(0.01,least(v_remaining,round(v_remaining/v_installments_left,2)));
  end if;
  insert into public.economy_cash_loan_installments(loan_id,season_id,period_id,due_amount,status)
  values(v_loan.id,v_period.season_id,p_period_id,v_due,'overdue') on conflict(loan_id,period_id) do nothing returning id into v_installment;
  if v_installment is null then continue; end if;
  select balance into v_balance from public.economy_wallet_accounts where id=v_loan.wallet_id for update;
  if coalesce(v_balance,0)<v_due then update public.economy_cash_loans set status='overdue' where id=v_loan.id;v_overdue:=v_overdue+1;continue;end if;
  v_tx:=private.post_cash_loan_transaction(v_loan.wallet_id,v_bank,v_due,'loan_repayment','Cash Loan installment · '||v_period.title,
   'cash-loan-repayment:'||v_loan.id::text||':'||v_period.id::text,p_actor_id,
   jsonb_build_object('loan_id',v_loan.id,'period_id',v_period.id,'season_id',v_period.season_id,'installment_id',v_installment));
  update public.economy_cash_loan_installments set status='paid',transaction_id=(v_tx->>'transaction_id')::uuid,paid_at=now() where id=v_installment;
  update public.economy_cash_loans set amount_repaid=amount_repaid+v_due,
   status=case when amount_repaid+v_due>=total_due then 'paid' else 'active' end,
   paid_at=case when amount_repaid+v_due>=total_due then now() else null end where id=v_loan.id;
  v_paid:=v_paid+1;
 end loop;
 return jsonb_build_object('paid',v_paid,'overdue',v_overdue,'period_id',p_period_id);
end;
$$;

create or replace function public.process_license_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_round public.license_rounds%rowtype;v_rule public.caleris_configurations%rowtype;v_member record;
 v_streak integer;v_threshold integer;v_penalty numeric;v_current numeric;v_delta numeric;
 v_processed integer:=0;v_payroll jsonb;v_repayments jsonb;
begin
 if not public.is_caleris_fia_or_admin() then raise exception 'Hanya Admin atau FIA yang dapat memproses round.'; end if;
 select * into v_round from public.license_rounds where id=p_round_id for update;
 if not found then raise exception 'Round tidak ditemukan.'; end if;
 if v_round.status='closed' then raise exception 'Round sudah diproses.'; end if;
 if v_round.checkin_closes_at>now() then raise exception 'Periode check-in round ini belum berakhir.'; end if;
 if exists(select 1 from public.license_rounds previous where previous.season_division_id=v_round.season_division_id and previous.round_number<v_round.round_number and previous.status<>'closed') then raise exception 'Round harus diproses berurutan. Selesaikan seluruh round sebelumnya terlebih dahulu.'; end if;
 if not exists(select 1 from public.license_season_divisions sd join public.license_seasons s on s.id=sd.season_id where sd.id=v_round.season_division_id and sd.status='active' and s.status='active') then raise exception 'Season dan divisi harus aktif untuk memproses round.'; end if;
 select * into v_rule from public.caleris_configurations where category='license' and config_key='scoring-inactivity' and is_active;
 v_threshold:=nullif(v_rule.payload->>'absence_races','')::integer;v_penalty:=nullif(v_rule.payload->>'penalty_points','')::numeric;
 if v_threshold is null or v_threshold<=0 or v_penalty is null or v_penalty<=0 then raise exception 'Konfigurasi inactivity penalty belum valid.'; end if;
 for v_member in select sm.member_id,sm.season_id,sm.consecutive_absent_rounds from public.license_season_members sm where sm.season_division_id=v_round.season_division_id and not sm.is_hiatus loop
  if exists(select 1 from public.license_daily_checkins c where c.member_id=v_member.member_id and c.checkin_date between (v_round.checkin_opens_at at time zone 'Asia/Jakarta')::date and (v_round.checkin_closes_at at time zone 'Asia/Jakarta')::date) then v_streak:=0;
  else
   v_streak:=v_member.consecutive_absent_rounds+1;
   if v_streak>=v_threshold and mod(v_streak,v_threshold)=0 then
    select coalesce(sum(l.points_delta),0) into v_current from public.license_score_ledger l where l.member_id=v_member.member_id and l.season_id=v_member.season_id and l.source_type<>'wdc';
    v_delta:=-least(v_penalty,greatest(v_current,0));
    if v_delta<0 then
     insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
     values(v_member.member_id,v_member.season_id,v_round.season_division_id,'inactivity_penalty',v_delta,'absence:'||v_round.id::text||':'||v_member.member_id::text,'Inactivity penalty after consecutive rounds without daily check-in',jsonb_build_object('round_id',v_round.id,'absence_streak',v_streak,'configured_penalty',v_penalty))
     on conflict(idempotency_key) do nothing;
    end if;
   end if;
  end if;
  update public.license_season_members set consecutive_absent_rounds=v_streak where season_division_id=v_round.season_division_id and member_id=v_member.member_id;
  v_processed:=v_processed+1;
 end loop;
 update public.license_rounds set status='closed',processed_at=now(),processed_by=(select auth.uid()) where id=p_round_id;
 v_payroll:=private.payroll_for_period_round(p_round_id,(select auth.uid()));
 if v_payroll ? 'period_id' then v_repayments:=private.process_cash_loan_repayments((v_payroll->>'period_id')::uuid,(select auth.uid()));
 else v_repayments:=jsonb_build_object('paid',0,'overdue',0); end if;
 return jsonb_build_object('round_id',p_round_id,'drivers_processed',v_processed,'status','closed','payroll',v_payroll,'cash_loan_repayments',v_repayments);
end;
$$;

revoke all on function private.post_cash_loan_transaction(uuid,uuid,numeric,text,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.process_cash_loan_repayments(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.member_cash_loan_preview(uuid) from public,anon,authenticated,service_role;
revoke all on function public.member_apply_cash_loan(uuid,numeric,integer) from public,anon,authenticated,service_role;
grant execute on function public.member_cash_loan_preview(uuid),public.member_apply_cash_loan(uuid,numeric,integer) to service_role;
revoke all on function public.process_license_round(uuid) from public,anon,service_role;
grant execute on function public.process_license_round(uuid) to authenticated;
