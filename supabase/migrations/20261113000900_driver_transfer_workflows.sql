-- Driver transfer negotiation, FIA review, tax settlement, and transfer-window execution.
alter table public.caleris_driver_move_offers
 add column if not exists loan_starts_on date,
 add column if not exists loan_ends_on date;

alter table public.caleris_driver_move_negotiations
 add column if not exists transfer_transaction_id uuid references public.economy_transactions(id) on delete restrict,
 add column if not exists tax_transaction_id uuid references public.economy_transactions(id) on delete restrict;

create unique index if not exists caleris_driver_move_one_open_per_driver
 on public.caleris_driver_move_negotiations(driver_member_id)
 where status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved');

create or replace function public.member_start_driver_move(
 p_driver_member_id uuid,p_move_type text,p_offer_amount numeric,
 p_loan_starts_on date default null,p_loan_ends_on date default null,p_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid());v_actor public.members%rowtype;v_driver public.members%rowtype;v_id uuid;v_offer uuid;
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
 if not found or v_actor.role not in ('Owner','Principal') or v_actor.team_id is null then raise exception 'Hanya Team Owner/Principal yang terhubung ke tim dapat mengajukan rekrutmen.'; end if;
 select * into v_driver from public.members where id=p_driver_member_id and role='Driver';
 if not found or v_driver.team_id is null then raise exception 'Driver harus terikat pada tim saat ini.'; end if;
 if v_actor.team_id=v_driver.team_id then raise exception 'Driver sudah berada di tim kamu.'; end if;
 if p_move_type not in ('transfer','loan') then raise exception 'Jenis perpindahan tidak valid.'; end if;
 if p_offer_amount is null or p_offer_amount<=0 or p_offer_amount<>round(p_offer_amount,2) then raise exception 'Nominal penawaran harus lebih besar dari nol.'; end if;
 if p_move_type='loan' and (p_loan_starts_on is null or p_loan_ends_on is null or p_loan_ends_on<=p_loan_starts_on) then raise exception 'Periode Driver Loan wajib diisi dengan tanggal akhir setelah tanggal mulai.'; end if;
 if exists(select 1 from public.caleris_driver_move_negotiations where driver_member_id=p_driver_member_id and status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved')) then
  raise exception 'Driver sedang memiliki negosiasi perpindahan yang belum selesai.';
 end if;
 insert into public.caleris_driver_move_negotiations(move_type,driver_member_id,buyer_team_id,seller_team_id,initiated_by,loan_starts_on,loan_ends_on,status)
 values(p_move_type,p_driver_member_id,v_actor.team_id,v_driver.team_id,v_actor.id,p_loan_starts_on,p_loan_ends_on,'offered')
 returning id into v_id;
 insert into public.caleris_driver_move_offers(negotiation_id,offered_by_member_id,offered_amount,move_type,note,loan_starts_on,loan_ends_on)
 values(v_id,v_actor.id,p_offer_amount,p_move_type,nullif(trim(p_note),''),p_loan_starts_on,p_loan_ends_on)
 returning id into v_offer;
 return v_id;
end;
$$;
revoke all on function public.member_start_driver_move(uuid,text,numeric,date,date,text) from public,anon,service_role;
grant execute on function public.member_start_driver_move(uuid,text,numeric,date,date,text) to authenticated;

create or replace function public.member_respond_driver_move(
 p_negotiation_id uuid,p_action text,p_amount numeric default null,p_move_type text default null,
 p_note text default null,p_loan_starts_on date default null,p_loan_ends_on date default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid());v_actor public.members%rowtype;v_neg public.caleris_driver_move_negotiations%rowtype;
 v_last public.caleris_driver_move_offers%rowtype;v_last_team uuid;v_actor_team uuid;v_limits public.caleris_configurations%rowtype;
 v_max_side integer;v_max_total integer;v_side_count integer;v_total_count integer;v_new_type text;
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
 if not found or v_actor.role not in ('Owner','Principal') or v_actor.team_id is null then raise exception 'Akses Team Owner/Principal diperlukan.'; end if;
 select * into v_neg from public.caleris_driver_move_negotiations where id=p_negotiation_id for update;
 if not found or v_neg.status not in ('offered','negotiating') then raise exception 'Negosiasi tidak tersedia untuk respons.'; end if;
 if v_actor.team_id not in (v_neg.buyer_team_id,v_neg.seller_team_id) then raise exception 'Tim kamu bukan pihak dalam negosiasi ini.'; end if;
 select * into v_last from public.caleris_driver_move_offers where negotiation_id=p_negotiation_id order by created_at desc,id desc limit 1;
 select team_id into v_last_team from public.members where id=v_last.offered_by_member_id;
 if v_last.id is null or v_last_team=v_actor.team_id then raise exception 'Pihak yang sama tidak dapat merespons penawarannya sendiri.'; end if;
 if p_action='reject' then
  update public.caleris_driver_move_offers set response='rejected' where id=v_last.id;
  update public.caleris_driver_move_negotiations set status='rejected',updated_at=now() where id=v_neg.id;
  return jsonb_build_object('status','rejected');
 elsif p_action='accept' then
  update public.caleris_driver_move_offers set response='accepted' where id=v_last.id;
  update public.caleris_driver_move_negotiations set status='pending_fia',agreed_amount=v_last.offered_amount,move_type=v_last.move_type,
   loan_starts_on=v_last.loan_starts_on,loan_ends_on=v_last.loan_ends_on,updated_at=now() where id=v_neg.id;
  return jsonb_build_object('status','pending_fia','agreed_amount',v_last.offered_amount);
 elsif p_action='counter' then
  select * into v_limits from public.caleris_configurations where category='economy' and config_key='driver-move-negotiation-limits' and is_active;
  v_max_side:=nullif(v_limits.payload->>'max_counters_per_side','')::integer;
  v_max_total:=nullif(v_limits.payload->>'max_total_counters','')::integer;
  if v_max_side is null or v_max_total is null or v_max_side<0 or v_max_total<0 then raise exception 'Admin belum mengatur batas counter-offer Driver Transfer.'; end if;
  if p_amount is null or p_amount<=v_last.offered_amount or p_amount<>round(p_amount,2) then raise exception 'Counter-offer wajib lebih tinggi daripada penawaran sebelumnya.'; end if;
  v_new_type:=coalesce(p_move_type,v_last.move_type);
  if v_new_type not in ('transfer','loan') then raise exception 'Jenis perpindahan tidak valid.'; end if;
  if v_new_type='loan' and (p_loan_starts_on is null or p_loan_ends_on is null or p_loan_ends_on<=p_loan_starts_on) then raise exception 'Periode Driver Loan wajib diisi.'; end if;
  select count(*) into v_side_count from public.caleris_driver_move_offers o join public.members m on m.id=o.offered_by_member_id where o.negotiation_id=v_neg.id and m.team_id=v_actor.team_id and o.response<>'superseded';
  if v_actor.team_id=v_neg.buyer_team_id then v_side_count:=greatest(v_side_count-1,0); end if;
  select count(*)-1 into v_total_count from public.caleris_driver_move_offers where negotiation_id=v_neg.id;
  if v_side_count>=v_max_side or v_total_count>=v_max_total then raise exception 'Batas negosiasi ulang telah tercapai.'; end if;
  update public.caleris_driver_move_offers set response='countered' where id=v_last.id;
  insert into public.caleris_driver_move_offers(negotiation_id,offered_by_member_id,offered_amount,move_type,note,loan_starts_on,loan_ends_on)
  values(v_neg.id,v_actor.id,p_amount,v_new_type,nullif(trim(p_note),''),p_loan_starts_on,p_loan_ends_on);
  update public.caleris_driver_move_negotiations set status='negotiating',total_counteroffers=total_counteroffers+1,updated_at=now() where id=v_neg.id;
  return jsonb_build_object('status','negotiating','counteroffers',v_total_count+1);
 else raise exception 'Action negosiasi tidak dikenal.'; end if;
end;
$$;
revoke all on function public.member_respond_driver_move(uuid,text,numeric,text,text,date,date) from public,anon,service_role;
grant execute on function public.member_respond_driver_move(uuid,text,numeric,text,text,date,date) to authenticated;

create or replace function private.execute_approved_driver_move(p_negotiation_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_neg public.caleris_driver_move_negotiations%rowtype;v_buy_wallet uuid;v_sell_wallet uuid;v_bank uuid;
 v_tax_rule public.caleris_tax_rules%rowtype;v_tax numeric:=0;v_total numeric;v_result jsonb;v_tax_result jsonb;v_done integer:=0;
begin
 if not exists(select 1 from public.season_calendar_periods p where p.period_type in ('end_season','off_season') and current_date between p.starts_on and p.ends_on) then
  return jsonb_build_object('executed',0,'reason','transfer_window_closed');
 end if;
 for v_neg in
  select * from public.caleris_driver_move_negotiations
  where status='approved_waiting_window' and move_type='transfer'
   and (p_negotiation_id is null or id=p_negotiation_id)
  order by created_at for update skip locked
 loop
  select id into v_buy_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_neg.buyer_team_id and is_active;
  select id into v_sell_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_neg.seller_team_id and is_active;
  select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active;
  if v_buy_wallet is null or v_sell_wallet is null or v_bank is null then continue; end if;
  select * into v_tax_rule from public.caleris_tax_rules where tax_type='driver_transfer' and is_active and minimum_base<=v_neg.agreed_amount order by minimum_base desc,sort_order desc,created_at desc limit 1;
  if not found then continue; end if;
  v_tax:=round(v_neg.agreed_amount*v_tax_rule.rate_percent/100,2);
  v_total:=v_neg.agreed_amount+v_tax;
  perform 1 from public.economy_wallet_accounts where id in (v_buy_wallet,v_sell_wallet,v_bank) order by id for update;
  if (select balance from public.economy_wallet_accounts where id=v_buy_wallet)<v_total then continue; end if;
  v_result:=private.post_economy_transaction(v_buy_wallet,v_sell_wallet,v_neg.agreed_amount,'transfer',
   'Driver transfer · '||v_neg.driver_member_id::text,'driver-transfer:'||v_neg.id::text,
   null,jsonb_build_object('negotiation_id',v_neg.id,'driver_member_id',v_neg.driver_member_id,'buyer_team_id',v_neg.buyer_team_id,'seller_team_id',v_neg.seller_team_id),null,false);
  if v_tax>0 then
   v_tax_result:=private.post_economy_transaction(v_buy_wallet,v_bank,v_tax,'tax',
    'Driver transfer tax · '||v_neg.driver_member_id::text,'driver-transfer-tax:'||v_neg.id::text,
    null,jsonb_build_object('negotiation_id',v_neg.id,'tax_rule_id',v_tax_rule.id,'base_fee',v_neg.agreed_amount,'rate_percent',v_tax_rule.rate_percent),null,false);
  end if;
  update public.members set team_id=v_neg.buyer_team_id where id=v_neg.driver_member_id and role='Driver' and team_id=v_neg.seller_team_id;
  if not found then raise exception 'Driver team assignment changed during approved transfer.'; end if;
  update public.economy_driver_contracts set status='ended',updated_at=now() where member_id=v_neg.driver_member_id and team_id=v_neg.seller_team_id and status='active';
  update public.caleris_driver_move_negotiations set status='executed',
   transfer_transaction_id=(v_result->>'transaction_id')::uuid,
   tax_transaction_id=case when v_tax>0 then (v_tax_result->>'transaction_id')::uuid else null end,
   updated_at=now() where id=v_neg.id;
  v_done:=v_done+1;
 end loop;
 return jsonb_build_object('executed',v_done);
end;
$$;
revoke all on function private.execute_approved_driver_move(uuid) from public,anon,authenticated,service_role;

create or replace function public.fia_review_driver_move(p_negotiation_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_neg public.caleris_driver_move_negotiations%rowtype;v_result jsonb;
begin
 if not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat meninjau transfer Driver.'; end if;
 select * into v_neg from public.caleris_driver_move_negotiations where id=p_negotiation_id for update;
 if not found or v_neg.status<>'pending_fia' then raise exception 'Negosiasi belum siap untuk peninjauan FIA.'; end if;
 if not p_approve then
  update public.caleris_driver_move_negotiations set status='rejected',updated_at=now() where id=v_neg.id;
  return jsonb_build_object('status','rejected');
 end if;
 if v_neg.move_type='loan' then raise exception 'Persetujuan Driver Loan ditahan sampai aturan fee, kewajiban finansial, dan pengembalian loan dikonfigurasi.'; end if;
 if not exists(select 1 from public.caleris_tax_rules where tax_type='driver_transfer' and is_active) then raise exception 'Admin belum mengaktifkan konfigurasi Driver Transfer Tax.'; end if;
 update public.caleris_driver_move_negotiations set status='approved_waiting_window',updated_at=now() where id=v_neg.id;
 v_result:=private.execute_approved_driver_move(v_neg.id);
 return jsonb_build_object('status',case when (v_result->>'executed')::integer>0 then 'executed' else 'approved_waiting_window' end,'execution',v_result);
end;
$$;
revoke all on function public.fia_review_driver_move(uuid,boolean) from public,anon,service_role;
grant execute on function public.fia_review_driver_move(uuid,boolean) to authenticated;

do $driver_move_schedule$
declare v_job_id bigint;
begin
 select jobid into v_job_id from cron.job where jobname='caleris-driver-transfer-window' limit 1;
 if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
 perform cron.schedule('caleris-driver-transfer-window','* * * * *',
  'select private.execute_approved_driver_move(null);');
end;
$driver_move_schedule$;
