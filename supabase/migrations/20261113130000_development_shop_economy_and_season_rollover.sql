-- Route Development Shop cash through the central economy transaction ledger.
alter table public.economy_transactions drop constraint if exists economy_transactions_event_type_check;
alter table public.economy_transactions add constraint economy_transactions_event_type_check
 check (event_type = any (array['checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment','development_shop_purchase']::text[]));

alter table public.economy_wallet_accounts drop constraint if exists economy_wallet_accounts_account_kind_check;
alter table public.economy_wallet_accounts add constraint economy_wallet_accounts_account_kind_check check(account_kind = any(array['public_member','driver','team_owner','team','vreeo_bank','sponsor_source','development_shop']::text[]));
alter table public.economy_wallet_accounts drop constraint if exists economy_wallet_owner_shape;
alter table public.economy_wallet_accounts add constraint economy_wallet_owner_shape check (
 ((account_kind='public_member') and profile_user_id is not null and member_id is null and team_id is null)
 or ((account_kind in ('driver','team_owner')) and profile_user_id is null and member_id is not null and team_id is null)
 or ((account_kind='team') and profile_user_id is null and member_id is null and team_id is not null)
 or ((account_kind in ('vreeo_bank','sponsor_source','development_shop')) and profile_user_id is null and member_id is null and team_id is null)
);
create unique index if not exists economy_wallet_development_shop_unique
 on public.economy_wallet_accounts(account_kind) where account_kind='development_shop';
insert into public.economy_wallet_accounts(account_kind,balance,is_active)
 values('development_shop',0,true) on conflict do nothing;

create or replace function private.post_economy_transaction(
 p_source_account_id uuid,p_destination_account_id uuid,p_amount numeric,p_event_type text,
 p_description text,p_idempotency_key text,p_actor_id uuid,p_metadata jsonb default '{}'::jsonb,
 p_reversal_of uuid default null,p_allow_pending boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_source public.economy_wallet_accounts%rowtype; v_destination public.economy_wallet_accounts%rowtype;
 v_existing public.economy_transactions%rowtype; v_original public.economy_transactions%rowtype; v_transaction_id uuid;
begin
 if p_amount is null or p_amount<=0 or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Nominal transaksi tidak valid.'; end if;
 if p_source_account_id is null or p_destination_account_id is null or p_source_account_id=p_destination_account_id then raise exception 'Wallet tidak valid.'; end if;
 if p_event_type not in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment','development_shop_purchase') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
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
 elsif p_reversal_of is not null then raise exception 'Referensi reversal hanya untuk reversal.'; end if;
 perform 1 from public.economy_wallet_accounts where id in (p_source_account_id,p_destination_account_id) order by id for update;
 select * into v_source from public.economy_wallet_accounts where id=p_source_account_id;
 select * into v_destination from public.economy_wallet_accounts where id=p_destination_account_id;
 if v_source.id is null or v_destination.id is null or not v_source.is_active or not v_destination.is_active then raise exception 'Wallet tidak ditemukan atau nonaktif.'; end if;
 if p_event_type='development_shop_purchase' and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind<>'development_shop') then raise exception 'Rute Development Shop tidak valid.'; end if;
 if p_event_type='checkin_reward' and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind not in ('driver','team_owner','public_member')) then raise exception 'Rute reward check-in tidak valid.';
 elsif p_event_type in ('prize','bank_reward') and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then raise exception 'Rute reward Bank tidak valid.';
 elsif p_event_type='sponsor_payout' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then raise exception 'Rute sponsor tidak valid.';
 elsif p_event_type='bank_funding' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind<>'vreeo_bank') then raise exception 'Rute funding Bank tidak valid.';
 elsif p_event_type in ('tax','fine') and (v_destination.account_kind<>'vreeo_bank' or v_source.account_kind in ('vreeo_bank','sponsor_source')) then raise exception 'Rute pajak/denda tidak valid.';
 elsif p_event_type='transfer' and (v_source.account_kind in ('vreeo_bank','sponsor_source') or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then raise exception 'Rute transfer tidak valid.';
 elsif p_event_type='admin_adjustment' and (v_source.account_kind='sponsor_source' or v_destination.account_kind='sponsor_source') then raise exception 'Rute penyesuaian tidak valid.';
 elsif p_event_type='payroll' and (v_source.account_kind<>'team' or v_destination.account_kind<>'driver' or not exists(select 1 from public.members m where m.id=v_destination.member_id and m.role='Driver' and (m.team_id=v_source.team_id or exists(select 1 from public.caleris_driver_move_negotiations n where n.id=nullif(p_metadata->>'loan_negotiation_id','')::uuid and n.driver_member_id=m.id and n.move_type='loan' and n.status in ('loan_active','loan_returned') and n.loan_season_id=nullif(p_metadata->>'season_id','')::uuid and v_source.team_id in (n.buyer_team_id,n.seller_team_id)))) then raise exception 'Payroll harus berasal dari tim kontrak Driver atau salah satu tim pada Driver Loan aktif/selesai.'; end if;
 if v_source.balance<p_amount and v_source.account_kind<>'sponsor_source' and p_event_type not in ('tax','fine') then if p_allow_pending then return null; end if; raise exception 'Saldo sumber tidak mencukupi.'; end if;
 insert into public.economy_transactions(event_type,source_account_id,destination_account_id,amount,idempotency_key,description,metadata,created_by,reversal_of)
 values(p_event_type,p_source_account_id,p_destination_account_id,p_amount,p_idempotency_key,trim(p_description),p_metadata,p_actor_id,p_reversal_of) returning id into v_transaction_id;
 insert into public.economy_entries(transaction_id,account_id,entry_side,amount) values(v_transaction_id,p_source_account_id,'outflow',p_amount),(v_transaction_id,p_destination_account_id,'inflow',p_amount);
 update public.economy_wallet_accounts set balance=balance-p_amount,updated_at=now() where id=p_source_account_id;
 update public.economy_wallet_accounts set balance=balance+p_amount,updated_at=now() where id=p_destination_account_id;
 return jsonb_build_object('transaction_id',v_transaction_id,'status','posted');
end; $function$;

create or replace function public.member_purchase_development_tokens(p_quantity numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.members%rowtype; v_profile public.profiles%rowtype; v_cfg public.caleris_development_shop_config%rowtype;
 v_bank public.economy_wallet_accounts%rowtype; v_sink public.economy_wallet_accounts%rowtype; v_dev public.caleris_development_accounts%rowtype;
 v_type text; v_total numeric(20,2); v_purchase uuid; v_tx jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,2) or p_quantity>100000000 then raise exception 'Jumlah token tidak valid.'; end if;
 select * into v_profile from public.profiles where user_id=auth.uid();
 if v_profile.member_id is null then raise exception 'Akun belum terhubung ke member.'; end if;
 select * into v_member from public.members where id=v_profile.member_id for update;
 if v_member.role not in ('Owner','Principal','Driver') then raise exception 'Shop hanya tersedia untuk Team Owner dan Driver.'; end if;
 v_type:=case when v_member.role='Driver' then 'DDP' else 'TDP' end;
 select * into v_cfg from public.caleris_development_shop_config where singleton=true;
 if not found or not v_cfg.is_active then raise exception 'Development Shop sedang nonaktif.'; end if;
 v_total:=round(p_quantity*v_cfg.token_price,2);
 select * into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active=true for update;
 select * into v_sink from public.economy_wallet_accounts where account_kind='development_shop' and is_active=true for update;
 if v_bank.id is null or v_sink.id is null then raise exception 'Wallet VreeoBank atau Development Shop belum tersedia.'; end if;
 if v_type='DDP' then select * into v_dev from public.caleris_development_accounts where asset_type='DDP' and member_id=v_member.id for update;
 else if v_member.team_id is null then raise exception 'Team Owner belum memiliki tim.'; end if; select * into v_dev from public.caleris_development_accounts where asset_type='TDP' and team_id=v_member.team_id for update; end if;
 if v_dev.id is null then raise exception 'Development wallet belum tersedia.'; end if;
 if v_total>0 then v_tx:=private.post_economy_transaction(v_bank.id,v_sink.id,v_total,'development_shop_purchase','Pembelian Development Token','devshop:'||gen_random_uuid()::text,auth.uid(),jsonb_build_object('member_id',v_member.id,'token_type',v_type,'quantity',p_quantity)); end if;
 update public.caleris_development_accounts set balance=balance+p_quantity,updated_at=now() where id=v_dev.id;
 insert into public.caleris_development_ledger(account_id,delta,source_type,description,idempotency_key,created_by,metadata)
 values(v_dev.id,p_quantity,'shop_purchase','Pembelian token development dari VreeoBank','shop:'||gen_random_uuid()::text,auth.uid(),jsonb_build_object('unit_price',v_cfg.token_price,'total_price',v_total,'token_type',v_type,'economy_transaction',v_tx));
 insert into public.caleris_development_shop_purchases(user_id,member_id,account_id,token_type,quantity,unit_price,total_price,bank_account_id)
 values(auth.uid(),v_member.id,v_dev.id,v_type,p_quantity,v_cfg.token_price,v_total,v_bank.id) returning id into v_purchase;
 return jsonb_build_object('purchase_id',v_purchase,'token_type',v_type,'quantity',p_quantity,'unit_price',v_cfg.token_price,'total_price',v_total,'economy_transaction',v_tx);
end; $$;

alter table public.caleris_development_season_snapshots add column if not exists snapshot_stage text not null default 'season_end' check(snapshot_stage in ('season_end','season_baseline'));
drop index if exists public.caleris_dev_snapshot_member_uq;
drop index if exists public.caleris_dev_snapshot_team_uq;
create unique index caleris_dev_snapshot_member_stage_uq on public.caleris_development_season_snapshots(season_id,asset_type,member_id,snapshot_stage) where member_id is not null;
create unique index caleris_dev_snapshot_team_stage_uq on public.caleris_development_season_snapshots(season_id,asset_type,team_id,snapshot_stage) where team_id is not null;

create or replace function public.admin_rollover_development_season(p_ending_season_id uuid,p_next_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer:=0; v_rows integer:=0;
begin
 if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'Admin only.'; end if;
 if p_ending_season_id is null or p_next_season_id is null or p_ending_season_id=p_next_season_id then raise exception 'Season rollover tidak valid.'; end if;
 if not exists(select 1 from public.license_seasons where id=p_ending_season_id) or not exists(select 1 from public.license_seasons where id=p_next_season_id) then raise exception 'Season tidak ditemukan.'; end if;
 insert into public.caleris_development_season_snapshots(season_id,member_id,asset_type,attributes,snapshot_stage)
 select p_ending_season_id,a.member_id,'DDP',coalesce(jsonb_object_agg(d.attribute_key,d.current_value),'{}'::jsonb),'season_end'
 from public.caleris_development_accounts a left join public.caleris_driver_development_attributes d on d.member_id=a.member_id
 where a.asset_type='DDP' and a.member_id is not null group by a.member_id
 on conflict(season_id,asset_type,member_id,snapshot_stage) where member_id is not null do update set attributes=excluded.attributes;
 get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 insert into public.caleris_development_season_snapshots(season_id,team_id,asset_type,attributes,snapshot_stage)
 select p_ending_season_id,a.team_id,'TDP',coalesce(jsonb_object_agg(d.part_key,d.current_value),'{}'::jsonb),'season_end'
 from public.caleris_development_accounts a left join public.caleris_team_development_parts d on d.team_id=a.team_id
 where a.asset_type='TDP' and a.team_id is not null group by a.team_id
 on conflict(season_id,asset_type,team_id,snapshot_stage) where team_id is not null do update set attributes=excluded.attributes;
 get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 insert into public.caleris_development_season_snapshots(season_id,member_id,asset_type,attributes,snapshot_stage)
 select p_next_season_id,member_id,asset_type,attributes,'season_baseline'
 from public.caleris_development_season_snapshots where season_id=p_ending_season_id and snapshot_stage='season_end' and member_id is not null
 on conflict(season_id,asset_type,member_id,snapshot_stage) where member_id is not null do update set attributes=excluded.attributes;
 get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 insert into public.caleris_development_season_snapshots(season_id,team_id,asset_type,attributes,snapshot_stage)
 select p_next_season_id,team_id,asset_type,attributes,'season_baseline'
 from public.caleris_development_season_snapshots where season_id=p_ending_season_id and snapshot_stage='season_end' and team_id is not null
 on conflict(season_id,asset_type,team_id,snapshot_stage) where team_id is not null do update set attributes=excluded.attributes;
 get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 return jsonb_build_object('ending_season_id',p_ending_season_id,'next_season_id',p_next_season_id,'snapshot_rows_written',v_count);
end; $$;

revoke all on function public.admin_rollover_development_season(uuid,uuid) from public,anon;
grant execute on function public.admin_rollover_development_season(uuid,uuid) to authenticated;
