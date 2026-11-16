-- Harden Prizepool payout validation before settlement.
create or replace function public.payout_season_prizepool(p_season_division_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat membayarkan Prizepool.';end if;
 select * into v_division from public.license_season_divisions where id=p_season_division_id for update;
 if not found or v_division.status<>'completed' then raise exception 'Divisi harus difinalisasi sebelum Prizepool dibayarkan.';end if;
 if exists(select 1 from public.caleris_prizepool_payouts where season_division_id=p_season_division_id) then raise exception 'Prizepool untuk divisi ini sudah dibayarkan; pembayaran ulang diblokir.';end if;
 select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active order by created_at limit 1;
 if v_bank is null then raise exception 'Wallet VreeoBank aktif tidak ditemukan.';end if;
 select count(*) into v_driver_count from public.license_final_standings fs
 join public.license_season_members sm on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id and not sm.is_hiatus
 where fs.season_division_id=p_season_division_id;
 if v_driver_count=0 or v_driver_count<>(select count(*) from public.license_season_members where season_division_id=p_season_division_id and not is_hiatus) then raise exception 'Final standings Driver belum lengkap.';end if;
 select count(*) into v_team_count from public.teams where division_key=v_division.division_key;
 if v_team_count=0 or v_team_count<>(select count(*) from public.license_team_final_standings where season_division_id=p_season_division_id) then raise exception 'Final standings Team harus memuat seluruh tim pada divisi ini.';end if;
 if exists(select 1 from public.license_final_standings fs left join public.license_season_members sm
  on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id and not sm.is_hiatus
  where fs.season_division_id=p_season_division_id and sm.id is null) then raise exception 'Final standings Driver memuat peserta yang tidak aktif atau tidak terdaftar.';end if;
 if exists(select 1 from public.license_team_final_standings ts join public.teams t on t.id=ts.team_id
  where ts.season_division_id=p_season_division_id and t.division_key<>v_division.division_key) then raise exception 'Final standings Team memuat tim dari divisi lain.';end if;
 if (select min(final_position) from public.license_final_standings where season_division_id=p_season_division_id)<>1
  or (select max(final_position) from public.license_final_standings where season_division_id=p_season_division_id)<>v_driver_count then raise exception 'Posisi final Driver harus berurutan dari P1 tanpa celah.';end if;
 if (select min(final_position) from public.license_team_final_standings where season_division_id=p_season_division_id)<>1
  or (select max(final_position) from public.license_team_final_standings where season_division_id=p_season_division_id)<>v_team_count then raise exception 'Posisi final Team harus berurutan dari P1 tanpa celah.';end if;
 if exists(select 1 from public.license_team_final_standings a join public.license_team_final_standings b
  on b.season_division_id=a.season_division_id and b.final_position>a.final_position
  where a.season_division_id=p_season_division_id and a.final_points<b.final_points) then raise exception 'Posisi Team tidak sesuai urutan poin akhir.';end if;
 select count(*) into v_expected_count from (
  select fs.final_position,'driver'::text as recipient_type from public.license_final_standings fs
  join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key and pr.recipient_type='driver'
   and pr.final_position=fs.final_position and pr.is_active and pr.prize_amount>0 where fs.season_division_id=p_season_division_id
  union all
  select ts.final_position,'team'::text from public.license_team_final_standings ts
  join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key and pr.recipient_type='team'
   and pr.final_position=ts.final_position and pr.is_active and pr.prize_amount>0 where ts.season_division_id=p_season_division_id
 ) expected_prizes;
 for v_row in
  select 'driver'::text as recipient_type,fs.member_id as recipient_id,fs.final_position,pr.prize_amount
  from public.license_final_standings fs join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key
   and pr.recipient_type='driver' and pr.final_position=fs.final_position and pr.is_active
  where fs.season_division_id=p_season_division_id
  union all
  select 'team',ts.team_id,ts.final_position,pr.prize_amount
  from public.license_team_final_standings ts join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key
   and pr.recipient_type='team' and pr.final_position=ts.final_position and pr.is_active
  where ts.season_division_id=p_season_division_id
 loop
  if v_row.prize_amount=0 then continue;end if;
  if v_row.recipient_type='driver' then
   select id into v_wallet from public.economy_wallet_accounts where member_id=v_row.recipient_id and account_kind='driver' and is_active for update;
  else
   select id into v_wallet from public.economy_wallet_accounts where team_id=v_row.recipient_id and account_kind='team' and is_active for update;
  end if;
  if v_wallet is null then raise exception 'Wallet penerima Prizepool posisi % tidak ditemukan.',v_row.final_position;end if;
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
 if v_paid<>v_expected_count or v_expected_count=0 then raise exception 'Konfigurasi Prizepool belum mencakup semua posisi berhadiah. Tidak ada pembayaran yang disimpan.';end if;
 return jsonb_build_object('season_division_id',p_season_division_id,'payout_count',v_paid,'status','paid');
end;$$;
