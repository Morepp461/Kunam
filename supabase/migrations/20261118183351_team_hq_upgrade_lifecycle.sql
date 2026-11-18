-- Team HQ paid upgrade lifecycle: atomic Team Wallet -> VreeoBank settlement, timed completion.
alter table public.economy_transactions drop constraint if exists economy_transactions_event_type_check;
alter table public.economy_transactions add constraint economy_transactions_event_type_check
check (event_type = any (array[
 'checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine',
 'transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment',
 'development_upgrade','team_hq_upgrade'
]::text[]));

create or replace function private.post_economy_transaction(
 p_source_account_id uuid,p_destination_account_id uuid,p_amount numeric,p_event_type text,
 p_description text,p_idempotency_key text,p_actor_id uuid,p_metadata jsonb default '{}'::jsonb,
 p_reversal_of uuid default null,p_allow_pending boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_source public.economy_wallet_accounts%rowtype;
 v_destination public.economy_wallet_accounts%rowtype;
 v_existing public.economy_transactions%rowtype;
 v_original public.economy_transactions%rowtype;
 v_transaction_id uuid;
begin
 if p_amount is null or p_amount<=0 or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Nominal transaksi tidak valid.'; end if;
 if p_source_account_id is null or p_destination_account_id is null or p_source_account_id=p_destination_account_id then raise exception 'Wallet tidak valid.'; end if;
 if p_event_type not in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment','development_upgrade','team_hq_upgrade') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
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
$function$;

create or replace function public.member_start_team_hq_project(p_facility_key text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_user_id uuid := (select auth.uid());
 v_member public.members%rowtype;
 v_team public.teams%rowtype;
 v_config public.caleris_team_hq_facility_configs%rowtype;
 v_facility public.caleris_team_hq_facilities%rowtype;
 v_wallet public.economy_wallet_accounts%rowtype;
 v_bank public.economy_wallet_accounts%rowtype;
 v_project_id uuid := gen_random_uuid();
 v_existing public.economy_transactions%rowtype;
 v_result jsonb;
 v_level integer;
 v_max integer;
 v_cost numeric;
 v_days integer;
 v_active integer;
begin
 if v_user_id is null then raise exception 'Sesi login tidak ditemukan.'; end if;
 if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then raise exception 'Kunci transaksi tidak valid.'; end if;
 select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user_id for update of m;
 if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Hanya Team Owner atau Principal tim yang dapat memulai upgrade.'; end if;
 select * into v_team from public.teams where id=v_member.team_id for update;
 if not found then raise exception 'Tim tidak ditemukan.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('team-hq:'||v_team.id::text,0));
 select * into v_existing from public.economy_transactions where idempotency_key=p_idempotency_key;
 if found then
  if v_existing.event_type<>'team_hq_upgrade' or v_existing.source_account_id is null then raise exception 'Kunci transaksi telah digunakan untuk transaksi lain.'; end if;
  return jsonb_build_object('status','duplicate','transaction_id',v_existing.id,'project_id',v_existing.metadata->>'project_id');
 end if;
 select * into v_config from public.caleris_team_hq_facility_configs where facility_key=p_facility_key and is_enabled;
 if not found then raise exception 'Fasilitas tidak tersedia untuk upgrade.'; end if;
 select * into v_facility from public.caleris_team_hq_facilities where team_id=v_team.id and facility_key=p_facility_key for update;
 if not found then raise exception 'Data fasilitas tim belum tersedia.'; end if;
 v_level:=v_facility.level+1;
 v_max:=case when lower(coalesce(v_team.division_key,'')) like '%zwei%' then v_config.max_level_zwei else v_config.max_level_premio end;
 if v_level>v_max then raise exception 'Level maksimum fasilitas pada divisi tim sudah tercapai.'; end if;
 if exists(select 1 from public.caleris_team_hq_projects where team_id=v_team.id and facility_key=p_facility_key and status in ('queued','in_progress')) then raise exception 'Fasilitas ini sudah memiliki proyek upgrade aktif.'; end if;
 select count(*) into v_active from public.caleris_team_hq_projects where team_id=v_team.id and status in ('queued','in_progress');
 if v_active>=2 then raise exception 'Maksimal dua proyek HQ dapat berjalan bersamaan.'; end if;
 v_cost:=nullif(v_config.construction_cost_by_level->>v_level::text,'')::numeric;
 v_days:=nullif(v_config.construction_days_by_level->>v_level::text,'')::integer;
 if v_cost is null or v_cost<=0 or v_days is null or v_days<=0 then raise exception 'Harga atau durasi level berikutnya belum dikonfigurasi FIA.'; end if;
 select * into v_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_team.id and is_active for update;
 if not found then raise exception 'Team Wallet belum tersedia. Hubungi FIA.'; end if;
 select * into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active for update;
 if not found then raise exception 'Wallet VreeoBank tidak tersedia.'; end if;
 v_result:=private.post_economy_transaction(
  v_wallet.id,v_bank.id,v_cost,'team_hq_upgrade','Team HQ upgrade: '||v_config.title||' ke level '||v_level,
  p_idempotency_key,v_user_id,jsonb_build_object('team_id',v_team.id,'facility_key',p_facility_key,'target_level',v_level,'project_id',v_project_id),null,false
 );
 insert into public.caleris_team_hq_projects(id,team_id,facility_key,target_level,status,cost,started_at,completes_at,created_by)
 values(v_project_id,v_team.id,p_facility_key,v_level,'in_progress',v_cost,now(),now()+make_interval(days=>v_days),v_user_id);
 return jsonb_build_object('status','started','project_id',v_project_id,'transaction_id',v_result->>'transaction_id','cost',v_cost,'duration_days',v_days);
end;
$function$;

create or replace function private.complete_due_team_hq_projects()
returns integer language plpgsql security definer set search_path='' as $function$
declare v_project public.caleris_team_hq_projects%rowtype; v_count integer:=0;
begin
 for v_project in select * from public.caleris_team_hq_projects where status='in_progress' and completes_at<=now() order by completes_at,id for update skip locked loop
  update public.caleris_team_hq_facilities
   set level=v_project.target_level,asset_value=asset_value+v_project.cost,updated_at=now()
   where team_id=v_project.team_id and facility_key=v_project.facility_key and level=v_project.target_level-1;
  if not found then
   raise warning 'Team HQ project % skipped: facility level changed unexpectedly.',v_project.id;
   continue;
  end if;
  update public.caleris_team_hq_projects set status='completed',completed_at=now() where id=v_project.id and status='in_progress';
  v_count:=v_count+1;
 end loop;
 return v_count;
end;
$function$;

revoke all on function public.member_start_team_hq_project(text,text) from public,anon;
grant execute on function public.member_start_team_hq_project(text,text) to authenticated;
revoke all on function private.complete_due_team_hq_projects() from public,anon,authenticated;

do $$
begin
 if exists(select 1 from cron.job where jobname='caleris-team-hq-project-completion') then
  perform cron.unschedule((select jobid from cron.job where jobname='caleris-team-hq-project-completion' limit 1));
 end if;
 perform cron.schedule('caleris-team-hq-project-completion','* * * * *','select private.complete_due_team_hq_projects();');
end $$;
