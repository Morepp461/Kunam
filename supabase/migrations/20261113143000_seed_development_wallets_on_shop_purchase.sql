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
 if v_member.role not in ('Owner','Driver') then raise exception 'Shop hanya tersedia untuk Team Owner dan Driver.'; end if;
 v_type:=case when v_member.role='Driver' then 'DDP' else 'TDP' end;
 select * into v_cfg from public.caleris_development_shop_config where singleton=true;
 if not found or not v_cfg.is_active then raise exception 'Development Shop sedang nonaktif.'; end if;
 v_total:=round(p_quantity*v_cfg.token_price,2);
 select * into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active=true for update;
 select * into v_sink from public.economy_wallet_accounts where account_kind='development_shop' and is_active=true for update;
 if v_bank.id is null or v_sink.id is null then raise exception 'Wallet VreeoBank atau Development Shop belum tersedia.'; end if;
 if v_type='DDP' then
  insert into public.caleris_development_accounts(asset_type,member_id,balance) values('DDP',v_member.id,0)
  on conflict(member_id) where asset_type='DDP' do nothing;
  select * into v_dev from public.caleris_development_accounts where asset_type='DDP' and member_id=v_member.id for update;
  insert into public.caleris_driver_development_attributes(member_id,attribute_key)
  select v_member.id,k from unnest(array['race_pace','qualifying_pace','experience','aggression','defensive_strength','overtake_skill','mistake_rate','tyre_management']) k
  on conflict(member_id,attribute_key) do nothing;
 else
  if v_member.team_id is null then raise exception 'Team Owner belum memiliki tim.'; end if;
  insert into public.caleris_development_accounts(asset_type,team_id,balance) values('TDP',v_member.team_id,0)
  on conflict(team_id) where asset_type='TDP' do nothing;
  select * into v_dev from public.caleris_development_accounts where asset_type='TDP' and team_id=v_member.team_id for update;
  insert into public.caleris_team_development_parts(team_id,part_key)
  select v_member.team_id,k from unnest(array['race_pace','qualifying_pace','engine_power','aero_power','low_speed_corners','high_speed_corners','traction','mechanical_grip','team_tyre_management','strategy_quality','team_morale','reliability','car_tyre_wear','pit_stop_efficiency','drs_efficiency','ers_efficiency']) k
  on conflict(team_id,part_key) do nothing;
 end if;
 if v_dev.id is null then raise exception 'Development wallet belum tersedia.'; end if;
 if v_total>0 then
  v_tx:=private.post_economy_transaction(v_bank.id,v_sink.id,v_total,'admin_adjustment','Pembelian Development Token','devshop:'||gen_random_uuid()::text,auth.uid(),jsonb_build_object('purpose','development_shop_purchase','member_id',v_member.id,'token_type',v_type,'quantity',p_quantity));
 end if;
 update public.caleris_development_accounts set balance=balance+p_quantity,updated_at=now() where id=v_dev.id;
 insert into public.caleris_development_ledger(account_id,delta,source_type,description,idempotency_key,created_by,metadata)
 values(v_dev.id,p_quantity,'shop_purchase','Pembelian token development dari VreeoBank','shop:'||gen_random_uuid()::text,auth.uid(),jsonb_build_object('unit_price',v_cfg.token_price,'total_price',v_total,'token_type',v_type,'economy_transaction',v_tx));
 insert into public.caleris_development_shop_purchases(user_id,member_id,account_id,token_type,quantity,unit_price,total_price,bank_account_id)
 values(auth.uid(),v_member.id,v_dev.id,v_type,p_quantity,v_cfg.token_price,v_total,v_bank.id) returning id into v_purchase;
 return jsonb_build_object('purchase_id',v_purchase,'token_type',v_type,'quantity',p_quantity,'unit_price',v_cfg.token_price,'total_price',v_total,'economy_transaction',v_tx);
end; $$;
revoke all on function public.member_purchase_development_tokens(numeric) from public,anon;
grant execute on function public.member_purchase_development_tokens(numeric) to authenticated;