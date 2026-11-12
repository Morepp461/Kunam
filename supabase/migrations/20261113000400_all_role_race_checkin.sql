-- All-role race attendance with Driver-only license scoring.
do $checkin_gateway$
declare v_definition text;v_original text;v_replacement text;
begin
 v_definition:=pg_get_functiondef('private.post_economy_transaction(uuid,uuid,numeric,text,text,text,uuid,jsonb,uuid,boolean)'::regprocedure);
 v_original:='(v_source.account_kind<>''vreeo_bank'' or v_destination.account_kind<>''driver'')';
 v_replacement:='(v_source.account_kind<>''vreeo_bank'' or v_destination.account_kind in (''vreeo_bank'',''sponsor_source''))';
 v_definition:=replace(v_definition,v_original,v_replacement);
 if position(v_replacement in v_definition)=0 then raise exception 'Could not widen check-in reward wallet destination validation.'; end if;
 execute v_definition;
end;
$checkin_gateway$;

create or replace function public.member_race_checkin(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=(select auth.uid());v_member public.members%rowtype;v_round public.license_rounds%rowtype;
 v_profile public.profiles%rowtype;v_config public.caleris_configurations%rowtype;
 v_amount numeric:=0;v_wallet uuid;v_bank uuid;v_checkin_id uuid;v_result jsonb;
begin
 if v_user is null then raise exception 'Authentication required.'; end if;
 select * into v_profile from public.profiles where user_id=v_user;
 if v_profile.member_id is null then raise exception 'Akun belum terhubung dengan member.'; end if;
 select * into v_member from public.members where id=v_profile.member_id;
 if not found then raise exception 'Member tidak ditemukan.'; end if;
 select * into v_round from public.license_rounds where id=p_round_id for update;
 if not found or v_round.status='closed' then raise exception 'Race tidak tersedia untuk check-in.'; end if;
 if now()<v_round.checkin_opens_at or now()>v_round.checkin_closes_at
   or (now() at time zone 'Asia/Jakarta')::date<>(v_round.checkin_opens_at at time zone 'Asia/Jakarta')::date
   or (now() at time zone 'Asia/Jakarta')::date<>(v_round.checkin_closes_at at time zone 'Asia/Jakarta')::date then
  raise exception 'Check-in hanya tersedia dalam jendela waktu race yang dijadwalkan.';
 end if;
 insert into public.caleris_member_race_checkins(member_id,round_id)
 values(v_member.id,p_round_id) returning id into v_checkin_id;

 -- Existing license scoring remains the single source of Driver license points.
 if v_member.role='Driver' then
  insert into public.license_daily_checkins(member_id,round_id,checkin_date)
  values(v_member.id,p_round_id,(now() at time zone 'Asia/Jakarta')::date);
 end if;

 select * into v_config from public.caleris_configurations
 where category='economy' and config_key='daily-checkin-reward' and is_active;
 v_amount:=coalesce(nullif(v_config.payload->>'amount','')::numeric,0);
 if v_amount>0 then
  select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active;
  if v_member.role='Driver' then
   select id into v_wallet from public.economy_wallet_accounts where account_kind='driver' and member_id=v_member.id and is_active;
  elsif v_member.role='Owner' then
   select id into v_wallet from public.economy_wallet_accounts where account_kind='team_owner' and member_id=v_member.id and is_active;
  else
   select id into v_wallet from public.economy_wallet_accounts where account_kind='public_member' and profile_user_id=v_user and is_active;
  end if;
  if v_bank is null or v_wallet is null then raise exception 'Wallet reward atau VreeoBank tidak tersedia.'; end if;
  v_result:=private.post_economy_transaction(v_bank,v_wallet,v_amount,'checkin_reward',
   'Race check-in reward · '||v_round.title,'member-race-checkin:'||v_checkin_id::text,
   v_user,jsonb_build_object('checkin_id',v_checkin_id,'round_id',p_round_id,'member_id',v_member.id,'role',v_member.role),null,true);
  if v_result is null then
   update public.caleris_member_race_checkins set reward_amount=v_amount,reward_status='pending' where id=v_checkin_id;
  else
   update public.caleris_member_race_checkins set reward_amount=v_amount,reward_status='paid',reward_transaction_id=(v_result->>'transaction_id')::uuid where id=v_checkin_id;
  end if;
 else
  update public.caleris_member_race_checkins set reward_amount=0,reward_status='not_configured' where id=v_checkin_id;
 end if;
 return jsonb_build_object('checkin_id',v_checkin_id,'reward_amount',v_amount,'reward_status',coalesce(v_result->>'status','not_configured'),'license_points',v_member.role='Driver');
end;
$$;
revoke all on function public.member_race_checkin(uuid) from public,anon,service_role;
grant execute on function public.member_race_checkin(uuid) to authenticated;

create or replace function public.admin_process_pending_member_race_checkins(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.caleris_member_race_checkins%rowtype;v_member public.members%rowtype;
 v_wallet uuid;v_bank uuid;v_result jsonb;v_paid integer:=0;v_pending integer:=0;
begin
 if p_actor_id is distinct from (select auth.uid()) or not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat memproses reward check-in tertunda.'; end if;
 select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active;
 for v_item in select * from public.caleris_member_race_checkins where reward_status='pending' order by checkin_at,id for update skip locked loop
  select * into v_member from public.members where id=v_item.member_id;
  if v_member.role='Driver' then
   select id into v_wallet from public.economy_wallet_accounts where account_kind='driver' and member_id=v_member.id and is_active;
  elsif v_member.role='Owner' then
   select id into v_wallet from public.economy_wallet_accounts where account_kind='team_owner' and member_id=v_member.id and is_active;
  else
   select wa.id into v_wallet from public.profiles p join public.economy_wallet_accounts wa on wa.profile_user_id=p.user_id and wa.account_kind='public_member' and wa.is_active where p.member_id=v_member.id;
  end if;
  if v_wallet is null or v_bank is null then v_pending:=v_pending+1;continue;end if;
  v_result:=private.post_economy_transaction(v_bank,v_wallet,v_item.reward_amount,'checkin_reward',
   'Race check-in reward · pending','member-race-checkin:'||v_item.id::text,
   p_actor_id,jsonb_build_object('checkin_id',v_item.id,'round_id',v_item.round_id,'member_id',v_item.member_id),null,true);
  if v_result is null then v_pending:=v_pending+1;
  else update public.caleris_member_race_checkins set reward_status='paid',reward_transaction_id=(v_result->>'transaction_id')::uuid where id=v_item.id;v_paid:=v_paid+1;end if;
 end loop;
 return jsonb_build_object('paid',v_paid,'pending',v_pending);
end;
$$;
revoke all on function public.admin_process_pending_member_race_checkins(uuid) from public,anon,service_role;
grant execute on function public.admin_process_pending_member_race_checkins(uuid) to authenticated;
