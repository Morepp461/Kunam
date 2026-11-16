-- Season Prizepool: final standings only; independent from per-race DDP/TDP rewards.
create table if not exists public.license_team_final_standings (
 id uuid primary key default gen_random_uuid(),
 season_division_id uuid not null references public.license_season_divisions(id) on delete cascade,
 team_id uuid not null references public.teams(id) on delete restrict,
 final_points numeric(12,2) not null default 0 check(final_points>=0),
 final_position integer not null check(final_position>=1),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 unique(season_division_id,team_id),
 unique(season_division_id,final_position)
);
create table if not exists public.caleris_prizepool_rules (
 division_key text not null check(division_key in ('premio','zwei')),
 recipient_type text not null check(recipient_type in ('driver','team')),
 final_position integer not null check(final_position>=1),
 prize_amount numeric(20,2) not null check(prize_amount>=0),
 is_active boolean not null default true,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(division_key,recipient_type,final_position)
);
create table if not exists public.caleris_prizepool_payouts (
 id uuid primary key default gen_random_uuid(),
 season_division_id uuid not null references public.license_season_divisions(id) on delete restrict,
 recipient_type text not null check(recipient_type in ('driver','team')),
 recipient_id uuid not null,
 final_position integer not null,
 prize_amount numeric(20,2) not null check(prize_amount>0),
 transaction_id uuid not null references public.economy_transactions(id) on delete restrict,
 paid_by uuid references auth.users(id) on delete set null,
 paid_at timestamptz not null default now(),
 unique(season_division_id,recipient_type,recipient_id),
 unique(season_division_id,recipient_type,final_position)
);
create index if not exists license_team_final_standings_division_idx on public.license_team_final_standings(season_division_id,final_position);
create index if not exists caleris_prizepool_payouts_division_idx on public.caleris_prizepool_payouts(season_division_id,recipient_type);

alter table public.license_team_final_standings enable row level security;
alter table public.caleris_prizepool_rules enable row level security;
alter table public.caleris_prizepool_payouts enable row level security;
revoke all on public.license_team_final_standings,public.caleris_prizepool_rules,public.caleris_prizepool_payouts from anon,authenticated,public;
grant select,insert,update,delete on public.license_team_final_standings to authenticated;
grant select,insert,update on public.caleris_prizepool_rules to authenticated;
grant select on public.caleris_prizepool_payouts to authenticated;
create policy "Admins manage team final standings" on public.license_team_final_standings for all to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Admins manage prizepool rules" on public.caleris_prizepool_rules for all to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Admins read prizepool payouts" on public.caleris_prizepool_payouts for select to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

-- Agreed final-season prize schedules. Values are Caleris Pound (¢p), not race rewards.
insert into public.caleris_prizepool_rules(division_key,recipient_type,final_position,prize_amount)
select 'premio','team',v.rank,v.amount from (values
(1,60000),(2,50000),(3,45000),(4,40000),(5,38000),(6,36000),(7,34000),(8,32000),(9,30000),(10,28000),(11,26000),(12,24000),(13,22000),(14,20000)
) v(rank,amount)
on conflict(division_key,recipient_type,final_position) do nothing;
insert into public.caleris_prizepool_rules(division_key,recipient_type,final_position,prize_amount)
select 'zwei','team',v.rank,v.amount from (values
(1,50000),(2,40000),(3,35000),(4,33000),(5,31000),(6,29000),(7,27000),(8,25000),(9,23000),(10,21000),(11,19000),(12,17000)
) v(rank,amount)
on conflict(division_key,recipient_type,final_position) do nothing;
insert into public.caleris_prizepool_rules(division_key,recipient_type,final_position,prize_amount)
select 'zwei','driver',v.rank,v.amount from (values
(1,40000),(2,35000),(3,32000),(4,30000),(5,29000),(6,28000),(7,27000),(8,26000),(9,25000),(10,24000),(11,23000),(12,22000),
(13,21000),(14,20000),(15,19000),(16,18000),(17,17000),(18,16000),(19,15000),(20,14000),(21,13000),(22,12000),(23,11000),(24,10000)
) v(rank,amount)
on conflict(division_key,recipient_type,final_position) do nothing;
insert into public.caleris_prizepool_rules(division_key,recipient_type,final_position,prize_amount)
select 'premio','driver',v.rank,v.amount from (values
(1,50000),(2,45000),(3,42000),(4,40000),(5,39000),(6,38000),(7,37000),(8,36000),(9,35000),(10,34000),(11,33000),(12,32000),
(13,31000),(14,30000),(15,29000),(16,28000),(17,27000),(18,26000),(19,25000),(20,24000),(21,23000),(22,22000),(23,21000),(24,20000),
(25,19000),(26,18000),(27,17000),(28,18000)
) v(rank,amount)
on conflict(division_key,recipient_type,final_position) do nothing;

create or replace function public.payout_season_prizepool(p_season_division_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 v_division public.license_season_divisions%rowtype;
 v_bank uuid;
 v_row record;
 v_wallet uuid;
 v_tx jsonb;
 v_paid integer:=0;
 v_driver_count integer;
 v_team_count integer;
 v_expected_count integer;
 v_rule_count integer;
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
  raise exception 'Hanya Admin yang dapat membayarkan Prizepool.';
 end if;
 select * into v_division from public.license_season_divisions where id=p_season_division_id for update;
 if not found or v_division.status<>'completed' then raise exception 'Divisi harus difinalisasi sebelum Prizepool dibayarkan.'; end if;
 if exists(select 1 from public.caleris_prizepool_payouts where season_division_id=p_season_division_id) then
  raise exception 'Prizepool untuk divisi ini sudah dibayarkan; pembayaran ulang diblokir.';
 end if;
 select id into v_bank from public.economy_wallet_accounts
 where account_kind='vreeo_bank' and is_active order by created_at limit 1;
 if v_bank is null then raise exception 'Wallet VreeoBank aktif tidak ditemukan.'; end if;

 select count(*) into v_driver_count from public.license_final_standings fs
 join public.license_season_members sm on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id and not sm.is_hiatus
 where fs.season_division_id=p_season_division_id;
 if v_driver_count=0 or v_driver_count<>(select count(*) from public.license_season_members where season_division_id=p_season_division_id and not is_hiatus) then
  raise exception 'Final standings Driver belum lengkap.';
 end if;
 select count(*) into v_team_count from public.teams where division_key=v_division.division_key;
 if v_team_count=0 or v_team_count<>(select count(*) from public.license_team_final_standings where season_division_id=p_season_division_id) then
  raise exception 'Final standings Team harus memuat seluruh tim pada divisi ini.';
 end if;
 if exists(select 1 from public.license_final_standings fs
   left join public.license_season_members sm on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id and not sm.is_hiatus
   where fs.season_division_id=p_season_division_id and sm.id is null) then
  raise exception 'Final standings Driver memuat peserta yang tidak aktif atau tidak terdaftar.';
 end if;
 if (select min(final_position) from public.license_final_standings where season_division_id=p_season_division_id)<>1
    or (select max(final_position) from public.license_final_standings where season_division_id=p_season_division_id)<>v_driver_count then
  raise exception 'Posisi final Driver harus berurutan dari P1 tanpa celah.';
 end if;
 if (select min(final_position) from public.license_team_final_standings where season_division_id=p_season_division_id)<>1
    or (select max(final_position) from public.license_team_final_standings where season_division_id=p_season_division_id)<>v_team_count then
  raise exception 'Posisi final Team harus berurutan dari P1 tanpa celah.';
 end if;
 if exists(select 1 from public.license_team_final_standings a
   join public.license_team_final_standings b on b.season_division_id=a.season_division_id and b.final_position>a.final_position
   where a.season_division_id=p_season_division_id and a.final_points<b.final_points) then
  raise exception 'Posisi Team tidak sesuai urutan poin akhir.';
 end if;
 if exists(select 1 from public.license_team_final_standings ts join public.teams t on t.id=ts.team_id
   where ts.season_division_id=p_season_division_id and t.division_key<>v_division.division_key) then
  raise exception 'Final standings Team memuat tim dari divisi lain.';
 end if;

 select count(*) into v_expected_count from (
  select fs.final_position,'driver'::text as recipient_type from public.license_final_standings fs
  join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key and pr.recipient_type='driver'
   and pr.final_position=fs.final_position and pr.is_active and pr.prize_amount>0
  where fs.season_division_id=p_season_division_id
  union all
  select ts.final_position,'team'::text from public.license_team_final_standings ts
  join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key and pr.recipient_type='team'
   and pr.final_position=ts.final_position and pr.is_active and pr.prize_amount>0
  where ts.season_division_id=p_season_division_id
 ) expected_prizes;
 for v_row in
  select 'driver'::text as recipient_type,fs.member_id as recipient_id,fs.final_position,pr.prize_amount
  from public.license_final_standings fs
  join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key and pr.recipient_type='driver'
    and pr.final_position=fs.final_position and pr.is_active
  where fs.season_division_id=p_season_division_id
  union all
  select 'team',ts.team_id,ts.final_position,pr.prize_amount
  from public.license_team_final_standings ts
  join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key and pr.recipient_type='team'
    and pr.final_position=ts.final_position and pr.is_active
  where ts.season_division_id=p_season_division_id
 loop
  if v_row.prize_amount<=0 then continue; end if;
  if v_row.recipient_type='driver' then
   select id into v_wallet from public.economy_wallet_accounts where member_id=v_row.recipient_id and account_kind='driver' and is_active for update;
  else
   select id into v_wallet from public.economy_wallet_accounts where team_id=v_row.recipient_id and account_kind='team' and is_active for update;
  end if;
  if v_wallet is null then raise exception 'Wallet penerima Prizepool posisi % tidak ditemukan.',v_row.final_position; end if;
  v_tx:=private.post_economy_transaction(v_bank,v_wallet,v_row.prize_amount,'prize',
    'Season Prizepool · '||v_division.division_name||' · '||initcap(v_row.recipient_type)||' P'||v_row.final_position,
    'season-prizepool:'||p_season_division_id::text||':'||v_row.recipient_type||':'||v_row.recipient_id::text,
    (select auth.uid()),jsonb_build_object('season_division_id',p_season_division_id,'division_key',v_division.division_key,
      'recipient_type',v_row.recipient_type,'recipient_id',v_row.recipient_id,'final_position',v_row.final_position));
  insert into public.caleris_prizepool_payouts(season_division_id,recipient_type,recipient_id,final_position,prize_amount,transaction_id,paid_by)
  values(p_season_division_id,v_row.recipient_type,v_row.recipient_id,v_row.final_position,v_row.prize_amount,
    (v_tx->>'transaction_id')::uuid,(select auth.uid()));
  v_paid:=v_paid+1;
 end loop;
 if v_paid<>v_expected_count or v_expected_count=0 then
  raise exception 'Konfigurasi Prizepool belum mencakup semua posisi berhadiah. Tidak ada pembayaran yang disimpan.';
 end if;
 return jsonb_build_object('season_division_id',p_season_division_id,'payout_count',v_paid,'status','paid');
end;
$$;
revoke all on function public.payout_season_prizepool(uuid) from public,anon;
grant execute on function public.payout_season_prizepool(uuid) to authenticated;
