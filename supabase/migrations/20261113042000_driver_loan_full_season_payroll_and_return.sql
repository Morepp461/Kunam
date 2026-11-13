begin;

alter table public.caleris_driver_move_negotiations
  add column if not exists loan_salary_share_percent numeric(5,2),
  add column if not exists loan_season_id uuid references public.license_seasons(id) on delete restrict,
  add column if not exists loan_fee_transaction_id uuid references public.economy_transactions(id) on delete restrict,
  add column if not exists loan_started_at timestamptz,
  add column if not exists loan_returned_at timestamptz;

alter table public.caleris_driver_move_offers
  add column if not exists loan_salary_share_percent numeric(5,2);

alter table public.caleris_driver_move_offers
  drop constraint if exists caleris_driver_move_offers_loan_dates_check;
alter table public.caleris_driver_move_offers
  add constraint caleris_driver_move_offers_loan_dates_check
  check (loan_starts_on is null or loan_ends_on is null or loan_ends_on>loan_starts_on);

alter table public.caleris_driver_move_negotiations
  drop constraint if exists caleris_driver_move_negotiations_status_check;
alter table public.caleris_driver_move_negotiations
  add constraint caleris_driver_move_negotiations_status_check
  check (status = any(array[
    'offered','negotiating','seller_accepted','pending_fia',
    'approved_waiting_window','approved','loan_active','loan_returned',
    'expired','rejected','executed','cancelled'
  ]));

alter table public.caleris_driver_move_negotiations
  drop constraint if exists caleris_driver_move_negotiations_loan_salary_share_check;
alter table public.caleris_driver_move_negotiations
  add constraint caleris_driver_move_negotiations_loan_salary_share_check
  check (
    loan_salary_share_percent is null or (
      loan_salary_share_percent between 0 and 100
      and mod(loan_salary_share_percent,10)=0
    )
  );

alter table public.caleris_driver_move_offers
  drop constraint if exists caleris_driver_move_offers_loan_salary_share_check;
alter table public.caleris_driver_move_offers
  add constraint caleris_driver_move_offers_loan_salary_share_check
  check (
    loan_salary_share_percent is null or (
      loan_salary_share_percent between 0 and 100
      and mod(loan_salary_share_percent,10)=0
    )
  );

drop index if exists public.caleris_driver_move_one_open_per_driver;
create unique index caleris_driver_move_one_open_per_driver
  on public.caleris_driver_move_negotiations(driver_member_id)
  where status in (
    'offered','negotiating','seller_accepted','pending_fia',
    'approved_waiting_window','approved','loan_active'
  );

create table if not exists public.economy_payroll_claim_splits (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.economy_payroll_claims(id) on delete restrict,
  payer_team_id uuid not null references public.teams(id) on delete restrict,
  amount numeric(20,2) not null check (amount>=0),
  share_percent numeric(5,2) not null check (share_percent>0 and share_percent<=100 and mod(share_percent,10)=0),
  status text not null default 'pending' check (status in ('pending','paid')),
  transaction_id uuid references public.economy_transactions(id) on delete restrict,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(claim_id,payer_team_id),
  check ((status='pending' and transaction_id is null and paid_at is null)
      or (status='paid' and paid_at is not null
        and ((amount=0 and transaction_id is null) or (amount>0 and transaction_id is not null))))
);

create index if not exists economy_payroll_claim_splits_payer_team_idx
  on public.economy_payroll_claim_splits(payer_team_id,created_at desc);
create index if not exists economy_payroll_claim_splits_claim_idx
  on public.economy_payroll_claim_splits(claim_id);


create or replace function private.guard_economy_payroll_claim_split()
returns trigger
language plpgsql
set search_path=''
as $
begin
  if tg_op='DELETE' then
    raise exception 'Payroll claim splits cannot be deleted.';
  end if;
  if new.id is distinct from old.id
    or new.claim_id is distinct from old.claim_id
    or new.payer_team_id is distinct from old.payer_team_id
    or new.amount is distinct from old.amount
    or new.share_percent is distinct from old.share_percent
    or new.created_at is distinct from old.created_at then
    raise exception 'Payroll claim split identity and amount are immutable.';
  end if;
  if not (old.status='pending' and new.status='paid'
    and old.transaction_id is null and old.paid_at is null and new.paid_at is not null
    and ((new.amount=0 and new.transaction_id is null) or (new.amount>0 and new.transaction_id is not null))) then
    raise exception 'Invalid payroll claim split status transition.';
  end if;
  return new;
end;
$;

drop trigger if exists economy_payroll_claim_split_guard on public.economy_payroll_claim_splits;
create trigger economy_payroll_claim_split_guard
before update or delete on public.economy_payroll_claim_splits
for each row execute function private.guard_economy_payroll_claim_split();

alter table public.economy_payroll_claim_splits enable row level security;
revoke all on public.economy_payroll_claim_splits from public,anon;
grant select on public.economy_payroll_claim_splits to authenticated;

create or replace function public.economy_can_read_payroll_claim(p_claim_id uuid,p_origin_team_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
    or exists(
      select 1 from public.economy_payroll_claims c
      join public.profiles p on p.member_id=c.member_id
      where c.id=p_claim_id and p.user_id=(select auth.uid())
    )
    or exists(
      select 1 from public.profiles p
      join public.members owner on owner.id=p.member_id
      where p.user_id=(select auth.uid())
        and owner.role='Owner'
        and owner.team_id=coalesce(
          p_origin_team_id,
          (select c.team_id from public.economy_payroll_claims c where c.id=p_claim_id)
        )
    )
    or exists(
      select 1 from public.economy_payroll_claim_splits s
      join public.profiles p on p.user_id=(select auth.uid())
      join public.members owner on owner.id=p.member_id
      where s.claim_id=p_claim_id
        and owner.role='Owner'
        and owner.team_id=s.payer_team_id
    );
$$;
revoke all on function public.economy_can_read_payroll_claim(uuid,uuid) from public,anon,service_role;
grant execute on function public.economy_can_read_payroll_claim(uuid,uuid) to authenticated;

drop policy if exists "Members and team owners read own payroll and team payroll" on public.economy_payroll_claims;
drop policy if exists "Members read own payroll and team payroll" on public.economy_payroll_claims;
create policy "Members and teams read payroll claims"
on public.economy_payroll_claims
for select to authenticated
using (public.economy_can_read_payroll_claim(id,team_id));

drop policy if exists "Members and team owners read payroll claim splits" on public.economy_payroll_claim_splits;
create policy "Members and teams read payroll claim splits"
on public.economy_payroll_claim_splits
for select to authenticated
using (public.economy_can_read_payroll_claim(claim_id,null));

drop function if exists public.member_start_driver_move(uuid,text,numeric,date,date,text);
create function public.member_start_driver_move(
  p_driver_member_id uuid,
  p_move_type text,
  p_offer_amount numeric,
  p_loan_starts_on date default null,
  p_loan_ends_on date default null,
  p_note text default null,
  p_loan_salary_share_percent numeric default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=(select auth.uid());
  v_actor public.members%rowtype;
  v_driver public.members%rowtype;
  v_season public.license_seasons%rowtype;
  v_id uuid;
  v_offer_id uuid;
begin
  select m.* into v_actor
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=v_user;

  if not found or coalesce(v_actor.role,'') not in ('Owner','Principal') or v_actor.team_id is null then
    raise exception 'Hanya Team Owner/Principal yang terhubung ke tim dapat mengajukan rekrutmen.';
  end if;

  if coalesce(p_move_type,'') not in ('transfer','loan') then raise exception 'Jenis perpindahan tidak valid.'; end if;
  if p_offer_amount is null or p_offer_amount<=0 or p_offer_amount<>round(p_offer_amount,2) then
    raise exception 'Nominal penawaran harus lebih besar dari nol.';
  end if;

  select * into v_driver from public.members where id=p_driver_member_id and role='Driver' for update;
  if not found or v_driver.team_id is null then raise exception 'Driver harus terikat pada tim saat ini.'; end if;
  if v_actor.team_id=v_driver.team_id then raise exception 'Driver sudah berada di tim kamu.'; end if;

  if p_move_type='loan' then
    if p_loan_starts_on is null or p_loan_ends_on is null
      or p_loan_salary_share_percent is null
      or p_loan_salary_share_percent<0 or p_loan_salary_share_percent>100
      or mod(p_loan_salary_share_percent,10)<>0 then
      raise exception 'Driver Loan wajib memiliki tanggal satu season penuh dan porsi gaji 0–100% dengan kelipatan 10%.';
    end if;

    select * into v_season from public.license_seasons
    where starts_on=p_loan_starts_on and ends_on=p_loan_ends_on
    order by created_at desc limit 1;

    if not found then
      raise exception 'Tanggal Driver Loan harus sama persis dengan awal dan akhir satu season pada Season Calendar.';
    end if;
    if p_loan_starts_on<(now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Driver Loan harus dimulai pada atau setelah tanggal hari ini.';
    end if;

    if not exists(
      select 1 from public.caleris_team_affiliations a
      where a.status='accepted'
        and ((a.team_a_id=v_actor.team_id and a.team_b_id=v_driver.team_id)
          or (a.team_a_id=v_driver.team_id and a.team_b_id=v_actor.team_id))
    ) then
      raise exception 'Driver Loan hanya dapat dilakukan antar tim yang memiliki afiliasi aktif.';
    end if;
  else
    if p_loan_starts_on is not null or p_loan_ends_on is not null or p_loan_salary_share_percent is not null then
      raise exception 'Data periode dan pembagian gaji hanya berlaku untuk Driver Loan.';
    end if;
  end if;

  if exists(
    select 1 from public.caleris_driver_move_negotiations
    where driver_member_id=p_driver_member_id
      and status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved','loan_active')
  ) then
    raise exception 'Driver sedang memiliki negosiasi perpindahan atau masa loan yang belum selesai.';
  end if;

  insert into public.caleris_driver_move_negotiations(
    move_type,driver_member_id,buyer_team_id,seller_team_id,initiated_by,
    loan_starts_on,loan_ends_on,loan_salary_share_percent,loan_season_id,status
  )
  values(
    p_move_type,p_driver_member_id,v_actor.team_id,v_driver.team_id,v_actor.id,
    p_loan_starts_on,p_loan_ends_on,p_loan_salary_share_percent,
    case when p_move_type='loan' then v_season.id else null end,'offered'
  )
  returning id into v_id;

  insert into public.caleris_driver_move_offers(
    negotiation_id,offered_by_member_id,offered_amount,move_type,note,
    loan_starts_on,loan_ends_on,loan_salary_share_percent
  )
  values(
    v_id,v_actor.id,p_offer_amount,p_move_type,nullif(trim(p_note),''),
    p_loan_starts_on,p_loan_ends_on,p_loan_salary_share_percent
  )
  returning id into v_offer_id;

  return v_id;
end;
$$;
revoke all on function public.member_start_driver_move(uuid,text,numeric,date,date,text,numeric) from public,anon,service_role;
grant execute on function public.member_start_driver_move(uuid,text,numeric,date,date,text,numeric) to authenticated;

drop function if exists public.member_respond_driver_move(uuid,text,numeric,text,text,date,date);
create function public.member_respond_driver_move(
  p_negotiation_id uuid,
  p_action text,
  p_amount numeric default null,
  p_move_type text default null,
  p_note text default null,
  p_loan_starts_on date default null,
  p_loan_ends_on date default null,
  p_loan_salary_share_percent numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=(select auth.uid());
  v_actor public.members%rowtype;
  v_neg public.caleris_driver_move_negotiations%rowtype;
  v_last public.caleris_driver_move_offers%rowtype;
  v_last_team uuid;
  v_limits public.caleris_configurations%rowtype;
  v_season public.license_seasons%rowtype;
  v_max_side integer;
  v_max_total integer;
  v_side_count integer;
  v_total_count integer;
  v_new_type text;
  v_share numeric;
  v_start date;
  v_end date;
begin
  select m.* into v_actor from public.profiles p
  join public.members m on m.id=p.member_id where p.user_id=v_user;
  if not found or coalesce(v_actor.role,'') not in ('Owner','Principal') or v_actor.team_id is null then
    raise exception 'Akses Team Owner/Principal diperlukan.';
  end if;

  select * into v_neg from public.caleris_driver_move_negotiations
  where id=p_negotiation_id for update;
  if not found or v_neg.status not in ('offered','negotiating') then
    raise exception 'Negosiasi tidak tersedia untuk respons.';
  end if;
  if v_actor.team_id not in (v_neg.buyer_team_id,v_neg.seller_team_id) then
    raise exception 'Tim kamu bukan pihak dalam negosiasi ini.';
  end if;

  select * into v_last from public.caleris_driver_move_offers
  where negotiation_id=p_negotiation_id
  order by created_at desc,id desc limit 1 for update;
  select team_id into v_last_team from public.members where id=v_last.offered_by_member_id;
  if v_last.id is null or v_last_team=v_actor.team_id then
    raise exception 'Pihak yang sama tidak dapat merespons penawarannya sendiri.';
  end if;

  if p_action='reject' then
    update public.caleris_driver_move_offers set response='rejected' where id=v_last.id;
    update public.caleris_driver_move_negotiations set status='rejected',updated_at=now() where id=v_neg.id;
    return jsonb_build_object('status','rejected');

  elsif p_action='accept' then
    if v_last.move_type='loan' then
      if v_last.loan_starts_on is null or v_last.loan_ends_on is null
        or v_last.loan_ends_on<=v_last.loan_starts_on
        or v_last.loan_salary_share_percent is null then
        raise exception 'Ketentuan Driver Loan pada penawaran terakhir belum lengkap.';
      end if;
      select * into v_season from public.license_seasons
      where id=v_neg.loan_season_id
        and starts_on=v_last.loan_starts_on and ends_on=v_last.loan_ends_on;
      if not found then raise exception 'Periode Driver Loan harus satu season penuh.'; end if;
      if not exists(
        select 1 from public.caleris_team_affiliations a
        where a.status='accepted'
          and ((a.team_a_id=v_neg.buyer_team_id and a.team_b_id=v_neg.seller_team_id)
            or (a.team_a_id=v_neg.seller_team_id and a.team_b_id=v_neg.buyer_team_id))
      ) then raise exception 'Afiliasi antar tim harus tetap aktif saat kesepakatan diterima.'; end if;
    end if;

    update public.caleris_driver_move_offers set response='accepted' where id=v_last.id;
    update public.caleris_driver_move_negotiations
    set status='pending_fia',
        agreed_amount=v_last.offered_amount,
        move_type=v_last.move_type,
        loan_starts_on=v_last.loan_starts_on,
        loan_ends_on=v_last.loan_ends_on,
        loan_salary_share_percent=v_last.loan_salary_share_percent,
        loan_season_id=case when v_last.move_type='loan' then v_neg.loan_season_id else null end,
        updated_at=now()
    where id=v_neg.id;
    return jsonb_build_object(
      'status','pending_fia',
      'agreed_amount',v_last.offered_amount,
      'loan_salary_share_percent',v_last.loan_salary_share_percent
    );

  elsif p_action='counter' then
    select * into v_limits from public.caleris_configurations
    where category='economy' and config_key='driver-move-negotiation-limits' and is_active;
    v_max_side:=nullif(v_limits.payload->>'max_counters_per_side','')::integer;
    v_max_total:=nullif(v_limits.payload->>'max_total_counters','')::integer;
    if v_max_side is null or v_max_total is null or v_max_side<0 or v_max_total<0 then
      raise exception 'Admin belum mengatur batas counter-offer Driver Transfer.';
    end if;
    if p_amount is null or p_amount<=v_last.offered_amount or p_amount<>round(p_amount,2) then
      raise exception 'Counter-offer wajib lebih tinggi daripada penawaran sebelumnya.';
    end if;

    v_new_type:=coalesce(p_move_type,v_last.move_type);
    if v_new_type not in ('transfer','loan') then raise exception 'Jenis perpindahan tidak valid.'; end if;
    v_start:=case when v_new_type='loan' then coalesce(p_loan_starts_on,v_last.loan_starts_on) else null end;
    v_end:=case when v_new_type='loan' then coalesce(p_loan_ends_on,v_last.loan_ends_on) else null end;
    v_share:=case when v_new_type='loan' then coalesce(p_loan_salary_share_percent,v_last.loan_salary_share_percent) else null end;

    if v_new_type='loan' then
      if v_start is null or v_end is null or v_end<=v_start or v_share is null
        or v_share<0 or v_share>100 or mod(v_share,10)<>0 then
        raise exception 'Counter Driver Loan wajib memiliki tanggal satu season penuh dan pembagian gaji kelipatan 10%.';
      end if;
      select * into v_season from public.license_seasons
      where starts_on=v_start and ends_on=v_end
      order by created_at desc limit 1;
      if not found then raise exception 'Tanggal Driver Loan harus sama persis dengan satu season penuh.'; end if;
      if v_start<(now() at time zone 'Asia/Jakarta')::date then raise exception 'Driver Loan tidak dapat dimulai pada tanggal yang sudah lewat.'; end if;
      if not exists(
        select 1 from public.caleris_team_affiliations a
        where a.status='accepted'
          and ((a.team_a_id=v_neg.buyer_team_id and a.team_b_id=v_neg.seller_team_id)
            or (a.team_a_id=v_neg.seller_team_id and a.team_b_id=v_neg.buyer_team_id))
      ) then raise exception 'Driver Loan hanya berlaku antar tim dengan afiliasi aktif.'; end if;
    end if;

    select count(*) into v_side_count
    from public.caleris_driver_move_offers o
    join public.members m on m.id=o.offered_by_member_id
    where o.negotiation_id=v_neg.id and m.team_id=v_actor.team_id and o.response<>'superseded';
    if v_actor.team_id=v_neg.buyer_team_id then v_side_count:=greatest(v_side_count-1,0); end if;
    select count(*)-1 into v_total_count from public.caleris_driver_move_offers where negotiation_id=v_neg.id;
    if v_side_count>=v_max_side or v_total_count>=v_max_total then
      raise exception 'Batas negosiasi ulang telah tercapai.';
    end if;

    update public.caleris_driver_move_offers set response='countered' where id=v_last.id;
    insert into public.caleris_driver_move_offers(
      negotiation_id,offered_by_member_id,offered_amount,move_type,note,
      loan_starts_on,loan_ends_on,loan_salary_share_percent
    )
    values(
      v_neg.id,v_actor.id,p_amount,v_new_type,nullif(trim(p_note),''),
      v_start,v_end,v_share
    );
    update public.caleris_driver_move_negotiations
    set status='negotiating',total_counteroffers=total_counteroffers+1,
        loan_season_id=case when v_new_type='loan' then v_season.id else null end,
        updated_at=now()
    where id=v_neg.id;
    return jsonb_build_object('status','negotiating','counteroffers',v_total_count+1);
  else
    raise exception 'Action negosiasi tidak dikenal.';
  end if;
end;
$$;
revoke all on function public.member_respond_driver_move(uuid,text,numeric,text,text,date,date,numeric) from public,anon,service_role;
grant execute on function public.member_respond_driver_move(uuid,text,numeric,text,text,date,date,numeric) to authenticated;

create or replace function private.execute_approved_driver_move(p_negotiation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_neg public.caleris_driver_move_negotiations%rowtype;
  v_driver public.members%rowtype;
  v_buyer_wallet uuid;
  v_seller_wallet uuid;
  v_bank uuid;
  v_tax_rule public.caleris_tax_rules%rowtype;
  v_tax numeric:=0;
  v_total numeric;
  v_result jsonb;
  v_tax_result jsonb;
  v_done integer:=0;
  v_started integer:=0;
  v_returned integer:=0;
  v_expired integer:=0;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
  -- Activate approved one-season loans on their configured start date.
  for v_neg in
    select * from public.caleris_driver_move_negotiations
    where status='approved_waiting_window'
      and move_type='loan'
      and loan_starts_on=v_today
      and loan_ends_on>=v_today
      and (p_negotiation_id is null or id=p_negotiation_id)
    order by loan_starts_on,created_at
    for update skip locked
  loop
    select * into v_driver from public.members
    where id=v_neg.driver_member_id for update;
    if not found or v_driver.role is distinct from 'Driver'
      or v_driver.team_id is distinct from v_neg.seller_team_id then
      update public.caleris_driver_move_negotiations
      set status='cancelled',updated_at=now()
      where id=v_neg.id;
      continue;
    end if;

    if not exists(
      select 1 from public.caleris_team_affiliations a
      where a.status='accepted'
        and ((a.team_a_id=v_neg.buyer_team_id and a.team_b_id=v_neg.seller_team_id)
          or (a.team_a_id=v_neg.seller_team_id and a.team_b_id=v_neg.buyer_team_id))
    ) then
      update public.caleris_driver_move_negotiations
      set status='cancelled',updated_at=now()
      where id=v_neg.id;
      continue;
    end if;

    select id into v_buyer_wallet from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_neg.buyer_team_id and is_active;
    select id into v_seller_wallet from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_neg.seller_team_id and is_active;
    if v_buyer_wallet is null or v_seller_wallet is null then continue; end if;

    perform 1 from public.economy_wallet_accounts
    where id in (v_buyer_wallet,v_seller_wallet) order by id for update;
    if (select balance from public.economy_wallet_accounts where id=v_buyer_wallet)<v_neg.agreed_amount then
      continue;
    end if;

    v_result:=private.post_economy_transaction(
      v_buyer_wallet,v_seller_wallet,v_neg.agreed_amount,'transfer',
      'Driver Loan fee · '||v_neg.driver_member_id::text,
      'driver-loan-fee:'||v_neg.id::text,
      null,
      jsonb_build_object(
        'negotiation_id',v_neg.id,'driver_member_id',v_neg.driver_member_id,
        'buyer_team_id',v_neg.buyer_team_id,'seller_team_id',v_neg.seller_team_id,
        'loan_season_id',v_neg.loan_season_id,
        'loan_salary_share_percent',v_neg.loan_salary_share_percent
      ),
      null,false
    );

    update public.members set team_id=v_neg.buyer_team_id
    where id=v_neg.driver_member_id and role='Driver' and team_id=v_neg.seller_team_id;
    if not found then raise exception 'Driver team assignment changed during loan activation.'; end if;

    update public.caleris_driver_move_negotiations
    set status='loan_active',
        loan_fee_transaction_id=(v_result->>'transaction_id')::uuid,
        loan_started_at=now(),
        updated_at=now()
    where id=v_neg.id;
    v_started:=v_started+1;
  end loop;

  -- An approved loan that misses its exact full-season start date cannot be activated late.
  update public.caleris_driver_move_negotiations
  set status='expired',updated_at=now()
  where status='approved_waiting_window'
    and move_type='loan'
    and loan_starts_on<v_today
    and (p_negotiation_id is null or id=p_negotiation_id);
  get diagnostics v_expired=row_count;

  -- Return the Driver to the original team on the day after the inclusive loan end date.
  for v_neg in
    select * from public.caleris_driver_move_negotiations
    where status='loan_active'
      and loan_ends_on<v_today
      and (p_negotiation_id is null or id=p_negotiation_id)
    order by loan_ends_on,created_at
    for update skip locked
  loop
    update public.members
    set team_id=v_neg.seller_team_id
    where id=v_neg.driver_member_id
      and role='Driver'
      and team_id=v_neg.buyer_team_id;
    if not found then
      continue;
    end if;
    update public.caleris_driver_move_negotiations
    set status='loan_returned',loan_returned_at=now(),updated_at=now()
    where id=v_neg.id;
    v_returned:=v_returned+1;
  end loop;

  -- Permanent transfers retain the established End Season / Off Season execution window.
  if not exists(
    select 1 from public.season_calendar_periods p
    where p.period_type in ('end_season','off_season')
      and v_today between p.starts_on and p.ends_on
  ) then
    return jsonb_build_object(
      'executed',0,'loans_started',v_started,'loans_returned',v_returned,
      'loans_expired',v_expired,'reason','transfer_window_closed'
    );
  end if;

  for v_neg in
    select * from public.caleris_driver_move_negotiations
    where status='approved_waiting_window'
      and move_type='transfer'
      and (p_negotiation_id is null or id=p_negotiation_id)
    order by created_at
    for update skip locked
  loop
    select id into v_buyer_wallet from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_neg.buyer_team_id and is_active;
    select id into v_seller_wallet from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_neg.seller_team_id and is_active;
    select id into v_bank from public.economy_wallet_accounts
    where account_kind='vreeo_bank' and is_active;
    if v_buyer_wallet is null or v_seller_wallet is null or v_bank is null then continue; end if;

    select * into v_tax_rule from public.caleris_tax_rules
    where tax_type='driver_transfer' and is_active and minimum_base<=v_neg.agreed_amount
    order by minimum_base desc,sort_order desc,created_at desc limit 1;
    if not found then v_tax:=0;
    else v_tax:=round(v_neg.agreed_amount*v_tax_rule.rate_percent/100,2); end if;

    v_total:=v_neg.agreed_amount+v_tax;
    perform 1 from public.economy_wallet_accounts
    where id in (v_buyer_wallet,v_seller_wallet,v_bank) order by id for update;
    if (select balance from public.economy_wallet_accounts where id=v_buyer_wallet)<v_total then continue; end if;

    v_result:=private.post_economy_transaction(
      v_buyer_wallet,v_seller_wallet,v_neg.agreed_amount,'transfer',
      'Driver transfer · '||v_neg.driver_member_id::text,
      'driver-transfer:'||v_neg.id::text,null,
      jsonb_build_object('negotiation_id',v_neg.id,'driver_member_id',v_neg.driver_member_id,
        'buyer_team_id',v_neg.buyer_team_id,'seller_team_id',v_neg.seller_team_id),
      null,false
    );
    if v_tax>0 then
      v_tax_result:=private.post_economy_transaction(
        v_buyer_wallet,v_bank,v_tax,'tax',
        'Driver transfer tax · '||v_neg.driver_member_id::text,
        'driver-transfer-tax:'||v_neg.id::text,null,
        jsonb_build_object('negotiation_id',v_neg.id,'tax_rule_id',v_tax_rule.id,
          'base_fee',v_neg.agreed_amount,'rate_percent',v_tax_rule.rate_percent),
        null,false
      );
    end if;

    update public.members set team_id=v_neg.buyer_team_id
    where id=v_neg.driver_member_id and role='Driver' and team_id=v_neg.seller_team_id;
    if not found then raise exception 'Driver team assignment changed during approved transfer.'; end if;

    update public.economy_driver_contracts
    set status='ended',updated_at=now()
    where member_id=v_neg.driver_member_id and team_id=v_neg.seller_team_id and status='active';

    update public.caleris_driver_move_negotiations
    set status='executed',
        transfer_transaction_id=(v_result->>'transaction_id')::uuid,
        tax_transaction_id=case when v_tax>0 then (v_tax_result->>'transaction_id')::uuid else null end,
        updated_at=now()
    where id=v_neg.id;
    v_done:=v_done+1;
  end loop;

  return jsonb_build_object(
    'executed',v_done,'loans_started',v_started,'loans_returned',v_returned,'loans_expired',v_expired
  );
end;
$$;
revoke all on function private.execute_approved_driver_move(uuid) from public,anon,authenticated,service_role;

create or replace function public.fia_review_driver_move(p_negotiation_id uuid,p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_neg public.caleris_driver_move_negotiations%rowtype;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_result jsonb;
begin
  if not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat meninjau perpindahan Driver.';
  end if;
  select * into v_neg from public.caleris_driver_move_negotiations
  where id=p_negotiation_id for update;
  if not found or v_neg.status<>'pending_fia' then
    raise exception 'Negosiasi belum siap untuk peninjauan FIA.';
  end if;

  if not p_approve then
    update public.caleris_driver_move_negotiations set status='rejected',updated_at=now() where id=v_neg.id;
    return jsonb_build_object('status','rejected');
  end if;

  if v_neg.move_type='loan' then
    if v_neg.loan_starts_on is null or v_neg.loan_ends_on is null
      or v_neg.loan_salary_share_percent is null or v_neg.loan_season_id is null then
      raise exception 'Ketentuan Driver Loan belum lengkap.';
    end if;
    if v_neg.loan_starts_on<v_today then
      raise exception 'Persetujuan FIA harus dilakukan sebelum tanggal mulai Driver Loan.';
    end if;
    if not exists(
      select 1 from public.license_seasons s
      where s.id=v_neg.loan_season_id
        and s.starts_on=v_neg.loan_starts_on
        and s.ends_on=v_neg.loan_ends_on
    ) then
      raise exception 'Driver Loan wajib berlangsung satu season penuh.';
    end if;
    if not exists(
      select 1 from public.caleris_team_affiliations a
      where a.status='accepted'
        and ((a.team_a_id=v_neg.buyer_team_id and a.team_b_id=v_neg.seller_team_id)
          or (a.team_a_id=v_neg.seller_team_id and a.team_b_id=v_neg.buyer_team_id))
    ) then
      raise exception 'Afiliasi antar tim sudah tidak aktif.';
    end if;
    if not exists(
      select 1 from public.members m
      where m.id=v_neg.driver_member_id and m.role='Driver' and m.team_id=v_neg.seller_team_id
    ) then
      raise exception 'Status atau tim asal Driver sudah berubah.';
    end if;
  else
    if not exists(
      select 1 from public.caleris_tax_rules
      where tax_type='driver_transfer' and is_active
    ) then
      raise exception 'Admin belum mengaktifkan konfigurasi Driver Transfer Tax.';
    end if;
  end if;

  update public.caleris_driver_move_negotiations
  set status='approved_waiting_window',updated_at=now()
  where id=v_neg.id;
  v_result:=private.execute_approved_driver_move(v_neg.id);

  return jsonb_build_object(
    'status',
    case
      when v_neg.move_type='loan' and (v_result->>'loans_started')::integer>0 then 'loan_active'
      when v_neg.move_type='transfer' and (v_result->>'executed')::integer>0 then 'executed'
      else 'approved_waiting_window'
    end,
    'execution',v_result
  );
end;
$$;
revoke all on function public.fia_review_driver_move(uuid,boolean) from public,anon,service_role;
grant execute on function public.fia_review_driver_move(uuid,boolean) to authenticated;

create or replace function private.post_economy_transaction(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_event_type text,
  p_description text,
  p_idempotency_key text,
  p_actor_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_reversal_of uuid default null,
  p_allow_pending boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source public.economy_wallet_accounts%rowtype;
  v_destination public.economy_wallet_accounts%rowtype;
  v_existing public.economy_transactions%rowtype;
  v_original public.economy_transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_amount is null or p_amount<=0 or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Nominal transaksi tidak valid.'; end if;
  if p_source_account_id is null or p_destination_account_id is null or p_source_account_id=p_destination_account_id then raise exception 'Wallet tidak valid.'; end if;
  if p_event_type not in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then raise exception 'Idempotency key tidak valid.'; end if;
  if p_description is null or length(trim(p_description)) not between 1 and 240 then raise exception 'Deskripsi transaksi tidak valid.'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then raise exception 'Metadata transaksi tidak valid.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  select * into v_existing from public.economy_transactions where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.source_account_id<>p_source_account_id or v_existing.destination_account_id<>p_destination_account_id or v_existing.amount<>p_amount or v_existing.event_type<>p_event_type then
      raise exception 'Idempotency key digunakan transaksi berbeda.';
    end if;
    return jsonb_build_object('transaction_id',v_existing.id,'status','duplicate');
  end if;

  if p_event_type='reversal' then
    if p_reversal_of is null then raise exception 'Referensi reversal wajib ada.'; end if;
    select * into v_original from public.economy_transactions where id=p_reversal_of for update;
    if not found or v_original.reversal_of is not null then raise exception 'Transaksi asal tidak valid.'; end if;
    if v_original.source_account_id<>p_destination_account_id or v_original.destination_account_id<>p_source_account_id or v_original.amount<>p_amount then
      raise exception 'Reversal tidak cocok.';
    end if;
  elsif p_reversal_of is not null then
    raise exception 'Referensi reversal hanya untuk reversal.';
  end if;

  perform 1 from public.economy_wallet_accounts
  where id in (p_source_account_id,p_destination_account_id)
  order by id for update;
  select * into v_source from public.economy_wallet_accounts where id=p_source_account_id;
  select * into v_destination from public.economy_wallet_accounts where id=p_destination_account_id;

  if v_source.id is null or v_destination.id is null or not v_source.is_active or not v_destination.is_active then
    raise exception 'Wallet tidak ditemukan atau nonaktif.';
  end if;

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
  elsif p_event_type='payroll' and (
    v_source.account_kind<>'team'
    or v_destination.account_kind<>'driver'
    or not exists(
      select 1 from public.members m
      where m.id=v_destination.member_id and m.role='Driver'
        and (
          m.team_id=v_source.team_id
          or exists(
            select 1 from public.caleris_driver_move_negotiations n
            where n.id=nullif(p_metadata->>'loan_negotiation_id','')::uuid
              and n.driver_member_id=m.id
              and n.move_type='loan'
              and n.status in ('loan_active','loan_returned')
              and n.loan_season_id=nullif(p_metadata->>'season_id','')::uuid
              and v_source.team_id in (n.buyer_team_id,n.seller_team_id)
          )
        )
    )
  ) then
    raise exception 'Payroll harus berasal dari tim kontrak Driver atau salah satu tim pada Driver Loan aktif/selesai.';
  end if;

  if v_source.balance<p_amount and v_source.account_kind<>'sponsor_source' and p_event_type not in ('tax','fine') then
    if p_allow_pending then return null; end if;
    raise exception 'Saldo sumber tidak mencukupi.';
  end if;

  insert into public.economy_transactions(
    event_type,source_account_id,destination_account_id,amount,idempotency_key,
    description,metadata,created_by,reversal_of
  )
  values(
    p_event_type,p_source_account_id,p_destination_account_id,p_amount,p_idempotency_key,
    trim(p_description),p_metadata,p_actor_id,p_reversal_of
  )
  returning id into v_transaction_id;

  insert into public.economy_entries(transaction_id,account_id,entry_side,amount)
  values
    (v_transaction_id,p_source_account_id,'outflow',p_amount),
    (v_transaction_id,p_destination_account_id,'inflow',p_amount);

  update public.economy_wallet_accounts
  set balance=balance-p_amount,updated_at=now()
  where id=p_source_account_id;
  update public.economy_wallet_accounts
  set balance=balance+p_amount,updated_at=now()
  where id=p_destination_account_id;

  return jsonb_build_object('transaction_id',v_transaction_id,'status','posted');
end;
$$;

create or replace function private.process_economy_payroll_claim(p_claim_id uuid,p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claim public.economy_payroll_claims%rowtype;
  v_period public.season_calendar_periods%rowtype;
  v_loan public.caleris_driver_move_negotiations%rowtype;
  v_origin_wallet uuid;
  v_borrower_wallet uuid;
  v_driver_wallet uuid;
  v_origin_amount numeric(20,2);
  v_borrower_amount numeric(20,2);
  v_share numeric(5,2);
  v_origin_transaction jsonb;
  v_borrower_transaction jsonb;
  v_primary_transaction jsonb;
  v_borrower_team_id uuid;
begin
  select * into v_claim from public.economy_payroll_claims
  where id=p_claim_id for update;
  if not found or v_claim.status='paid' then
    return jsonb_build_object('paid',false,'reason','claim_not_pending');
  end if;

  select * into v_period from public.season_calendar_periods where id=v_claim.period_id;
  if not found then raise exception 'Race Period payroll tidak ditemukan.'; end if;

  select * into v_loan
  from public.caleris_driver_move_negotiations n
  where n.driver_member_id=v_claim.member_id
    and n.move_type='loan'
    and n.loan_season_id=v_claim.season_id
    and n.status in ('loan_active','loan_returned')
    and n.loan_starts_on<=v_period.ends_on
    and n.loan_ends_on>=v_period.starts_on
  order by n.loan_started_at desc nulls last
  limit 1;

  select id into v_origin_wallet from public.economy_wallet_accounts
  where account_kind='team' and team_id=v_claim.team_id and is_active;
  select id into v_driver_wallet from public.economy_wallet_accounts
  where account_kind='driver' and member_id=v_claim.member_id and is_active;

  if v_loan.id is not null then
    v_borrower_team_id:=v_loan.buyer_team_id;
    v_share:=v_loan.loan_salary_share_percent;
    v_borrower_amount:=round(v_claim.amount*v_share/100,2);
    v_origin_amount:=v_claim.amount-v_borrower_amount;
    select id into v_borrower_wallet from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_borrower_team_id and is_active;

    if 100-v_share>0 then
      insert into public.economy_payroll_claim_splits(claim_id,payer_team_id,amount,share_percent)
      values(v_claim.id,v_claim.team_id,v_origin_amount,100-v_share)
      on conflict(claim_id,payer_team_id) do nothing;
    end if;
    if v_share>0 then
      insert into public.economy_payroll_claim_splits(claim_id,payer_team_id,amount,share_percent)
      values(v_claim.id,v_borrower_team_id,v_borrower_amount,v_share)
      on conflict(claim_id,payer_team_id) do nothing;
    end if;

    if v_origin_wallet is null or v_borrower_wallet is null or v_driver_wallet is null then
      return jsonb_build_object('paid',false,'reason','wallet_missing');
    end if;

    perform 1 from public.economy_wallet_accounts
    where id in (v_origin_wallet,v_borrower_wallet,v_driver_wallet)
    order by id for update;

    if (select balance from public.economy_wallet_accounts where id=v_borrower_wallet)<v_borrower_amount
      or (select balance from public.economy_wallet_accounts where id=v_origin_wallet)<v_origin_amount then
      return jsonb_build_object('paid',false,'reason','insufficient_team_balances');
    end if;

    if v_origin_amount>0 then
      v_origin_transaction:=private.post_economy_transaction(
        v_origin_wallet,v_driver_wallet,v_origin_amount,'payroll',
        'Driver Loan salary · '||v_period.title,
        'payroll:'||v_claim.period_id::text||':'||v_claim.member_id::text||':origin',
        p_actor_id,
        jsonb_build_object('season_id',v_claim.season_id,'period_id',v_claim.period_id,
          'member_id',v_claim.member_id,'team_id',v_claim.team_id,
          'annual_salary',v_claim.annual_salary,'period_count',v_claim.period_count,
          'loan_negotiation_id',v_loan.id,'loan_payer','origin',
          'loan_share_percent',100-v_share),
        null,false
      );
    end if;

    if v_borrower_amount>0 then
      v_borrower_transaction:=private.post_economy_transaction(
        v_borrower_wallet,v_driver_wallet,v_borrower_amount,'payroll',
        'Driver Loan salary · '||v_period.title,
        'payroll:'||v_claim.period_id::text||':'||v_claim.member_id::text||':borrower',
        p_actor_id,
        jsonb_build_object('season_id',v_claim.season_id,'period_id',v_claim.period_id,
          'member_id',v_claim.member_id,'team_id',v_borrower_team_id,
          'origin_team_id',v_claim.team_id,'annual_salary',v_claim.annual_salary,
          'period_count',v_claim.period_count,'loan_negotiation_id',v_loan.id,
          'loan_payer','borrower','loan_share_percent',v_share),
        null,false
      );
    end if;

    update public.economy_payroll_claim_splits
    set status='paid',
        transaction_id=case when payer_team_id=v_claim.team_id
          then (v_origin_transaction->>'transaction_id')::uuid
          else (v_borrower_transaction->>'transaction_id')::uuid end,
        paid_at=now()
    where claim_id=v_claim.id;

    v_primary_transaction:=coalesce(v_borrower_transaction,v_origin_transaction);
  else
    if v_origin_wallet is null or v_driver_wallet is null then
      return jsonb_build_object('paid',false,'reason','wallet_missing');
    end if;

    insert into public.economy_payroll_claim_splits(claim_id,payer_team_id,amount,share_percent)
    values(v_claim.id,v_claim.team_id,v_claim.amount,100)
    on conflict(claim_id,payer_team_id) do nothing;

    perform 1 from public.economy_wallet_accounts
    where id in (v_origin_wallet,v_driver_wallet) order by id for update;
    if (select balance from public.economy_wallet_accounts where id=v_origin_wallet)<v_claim.amount then
      return jsonb_build_object('paid',false,'reason','insufficient_team_balance');
    end if;

    v_primary_transaction:=private.post_economy_transaction(
      v_origin_wallet,v_driver_wallet,v_claim.amount,'payroll',
      'Annual salary · '||v_period.title,
      'payroll:'||v_claim.period_id::text||':'||v_claim.member_id::text,
      p_actor_id,
      jsonb_build_object('season_id',v_claim.season_id,'period_id',v_claim.period_id,
        'member_id',v_claim.member_id,'team_id',v_claim.team_id,
        'annual_salary',v_claim.annual_salary,'period_count',v_claim.period_count),
      null,false
    );

    update public.economy_payroll_claim_splits
    set status='paid',transaction_id=(v_primary_transaction->>'transaction_id')::uuid,paid_at=now()
    where claim_id=v_claim.id;
  end if;

  update public.economy_payroll_claims
  set status='paid',
      transaction_id=(v_primary_transaction->>'transaction_id')::uuid,
      paid_at=now()
  where id=v_claim.id;

  return jsonb_build_object('paid',true,'transaction_id',v_primary_transaction->>'transaction_id');
end;
$$;
revoke all on function private.process_economy_payroll_claim(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.payroll_for_period_round(p_round_id uuid,p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_map public.season_period_rounds%rowtype;
  v_period public.season_calendar_periods%rowtype;
  v_period_count integer;
  v_period_position integer;
  v_assigned_count integer;
  v_item record;
  v_amount numeric(20,2);
  v_paid integer:=0;
  v_pending integer:=0;
  v_claim_id uuid;
  v_result jsonb;
begin
  select map.* into v_map from public.season_period_rounds map where map.round_id=p_round_id;
  if not found then return jsonb_build_object('paid',0,'pending',0,'skipped','round_not_assigned'); end if;
  select * into v_period from public.season_calendar_periods where id=v_map.period_id and period_type='race_period';
  if not found then return jsonb_build_object('paid',0,'pending',0,'skipped','not_race_period'); end if;

  select count(*) into v_assigned_count from public.season_period_rounds
  where period_id=v_period.id and season_division_id=v_map.season_division_id;
  if v_assigned_count not between 3 and 5 then
    raise exception 'Race Period wajib berisi 3 sampai 5 round pada setiap divisi.';
  end if;
  if exists(
    select 1 from public.season_period_rounds other_map
    join public.license_rounds other_round on other_round.id=other_map.round_id
    where other_map.period_id=v_period.id
      and other_map.season_division_id=v_map.season_division_id
      and other_round.round_number>(select round_number from public.license_rounds where id=p_round_id)
  ) then
    return jsonb_build_object('paid',0,'pending',0,'skipped','not_final_round');
  end if;

  select count(*) into v_period_count from public.season_calendar_periods
  where season_id=v_period.season_id and period_type='race_period';
  if v_period_count<1 then raise exception 'Season belum memiliki Race Period.'; end if;
  select count(*) into v_period_position from public.season_calendar_periods
  where season_id=v_period.season_id and period_type='race_period' and sort_order<=v_period.sort_order;

  for v_item in
    select c.*,m.character_name
    from public.economy_driver_contracts c
    join public.members m on m.id=c.member_id and m.role='Driver'
    join public.license_season_members sm on sm.member_id=c.member_id
      and sm.season_id=c.season_id and sm.season_division_id=v_map.season_division_id
      and not sm.is_hiatus
    where c.season_id=v_period.season_id and c.status='active'
      and (
        m.team_id=c.team_id
        or exists(
          select 1 from public.caleris_driver_move_negotiations n
          where n.driver_member_id=c.member_id
            and n.seller_team_id=c.team_id
            and n.buyer_team_id=m.team_id
            and n.loan_season_id=c.season_id
            and n.status in ('loan_active','loan_returned')
        )
      )
    order by c.member_id
  loop
    v_amount:=case when v_period_position=v_period_count
      then v_item.annual_salary-coalesce((
        select sum(pc.amount) from public.economy_payroll_claims pc
        join public.season_calendar_periods pp on pp.id=pc.period_id
        where pc.season_id=v_period.season_id and pc.member_id=v_item.member_id
          and pp.period_type='race_period' and pp.sort_order<v_period.sort_order
      ),0)
      else round(v_item.annual_salary/v_period_count,2) end;
    if v_amount<=0 then continue; end if;

    insert into public.economy_payroll_claims(
      season_id,period_id,team_id,member_id,annual_salary,period_count,amount
    )
    values(v_period.season_id,v_period.id,v_item.team_id,v_item.member_id,
      v_item.annual_salary,v_period_count,v_amount)
    on conflict(period_id,member_id) do nothing
    returning id into v_claim_id;

    if v_claim_id is null then continue; end if;
    v_result:=private.process_economy_payroll_claim(v_claim_id,p_actor_id);
    if coalesce((v_result->>'paid')::boolean,false) then v_paid:=v_paid+1;
    else v_pending:=v_pending+1; end if;
  end loop;

  return jsonb_build_object('paid',v_paid,'pending',v_pending,'period_id',v_period.id,'period_count',v_period_count);
end;
$$;

create or replace function public.admin_process_pending_economy_payroll(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claim public.economy_payroll_claims%rowtype;
  v_result jsonb;
  v_paid integer:=0;
  v_pending integer:=0;
  v_period_id uuid;
  v_processed_periods uuid[]:=array[]::uuid[];
  v_repayments jsonb;
begin
  if p_actor_id is null or not exists(select 1 from public.site_admins a where a.user_id=p_actor_id) then
    raise exception 'Hanya Admin yang dapat memproses payroll tertunda.';
  end if;

  for v_claim in
    select * from public.economy_payroll_claims
    where status='pending' order by created_at,id for update skip locked
  loop
    v_result:=private.process_economy_payroll_claim(v_claim.id,p_actor_id);
    if coalesce((v_result->>'paid')::boolean,false) then
      v_paid:=v_paid+1;
      if not (v_claim.period_id=any(v_processed_periods)) then
        v_processed_periods:=array_append(v_processed_periods,v_claim.period_id);
      end if;
    else
      v_pending:=v_pending+1;
    end if;
  end loop;

  foreach v_period_id in array v_processed_periods loop
    v_repayments:=private.try_process_cash_loan_repayments(v_period_id,p_actor_id);
  end loop;

  return jsonb_build_object('paid',v_paid,'pending',v_pending);
end;
$$;

commit;