begin;

create table if not exists public.caleris_development_license_tier_mapping (
  license_label text primary key check (length(trim(license_label)) between 1 and 80),
  license_tier text check (license_tier is null or license_tier in ('bronze','silver','gold','super')),
  is_active boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((is_active and license_tier is not null) or (not is_active))
);
alter table public.caleris_development_license_tier_mapping enable row level security;
revoke all on public.caleris_development_license_tier_mapping from public,anon,authenticated;
grant select,insert,update on public.caleris_development_license_tier_mapping to authenticated;
create policy "Authenticated read development license tier mapping"
 on public.caleris_development_license_tier_mapping for select to authenticated using (true);
create policy "Admins manage development license tier mapping"
 on public.caleris_development_license_tier_mapping for all to authenticated
 using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
 with check (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

insert into public.caleris_development_license_tier_mapping(license_label,license_tier,is_active)
select distinct trim(license),null,false from public.members
where license is not null and length(trim(license)) between 1 and 80
on conflict(license_label) do nothing;

create or replace function public.member_upgrade_development_attribute(
 p_actor_id uuid,p_scope text,p_attribute_key text,p_new_value numeric,p_payment_method text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_member public.members%rowtype; v_profile public.profiles%rowtype;
 v_old numeric(5,2); v_delta numeric(5,2); v_cash_rate numeric(20,2);
 v_cash_cost numeric(20,2):=0; v_token_cost numeric(20,2):=0;
 v_cash_wallet_id uuid; v_treasury_id uuid; v_dev public.caleris_development_accounts%rowtype;
 v_attr_id uuid; v_history_id uuid; v_cash_remaining numeric(20,2); v_token_remaining numeric(20,2);
 v_idempotency text; v_tx jsonb; v_license_tier text; v_team_division text; v_now timestamptz:=now();
begin
 if p_actor_id is null or p_scope is null or p_scope not in ('team','driver') or p_payment_method is null or p_payment_method not in ('cash','token') then raise exception 'Data upgrade Development tidak valid.'; end if;
 if p_new_value is null or p_new_value<50 or p_new_value>100 or p_new_value<>round(p_new_value,2) then raise exception 'Nilai atribut harus 50 sampai 100.'; end if;
 select * into v_profile from public.profiles where user_id=p_actor_id;
 if not found or v_profile.member_id is null then raise exception 'Profil member tidak ditemukan.'; end if;
 select * into v_member from public.members where id=v_profile.member_id for update;
 if not found then raise exception 'Member tidak ditemukan.'; end if;
 if p_scope='team' then
  if v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Hanya Owner atau Principal tim yang dapat upgrade atribut tim.'; end if;
  select current_value,id into v_old,v_attr_id from public.caleris_team_development_parts where team_id=v_member.team_id and part_key=p_attribute_key for update;
  select lower(regexp_replace(coalesce(t.division_key,''),'[^a-z]','','g')) into v_team_division from public.teams t where t.id=v_member.team_id;
  if v_team_division not in ('premio','zwei') then raise exception 'Divisi tim belum ditetapkan sebagai Caleris Premio atau Caleris Zwei.'; end if;
  select cash_eur_per_point into v_cash_rate from public.caleris_team_development_division_pricing where division_key=v_team_division and part_key=p_attribute_key and is_configured;
 else
  if v_member.role<>'Driver' then raise exception 'Hanya Driver yang dapat upgrade atribut driver.'; end if;
  select current_value,id into v_old,v_attr_id from public.caleris_driver_development_attributes where member_id=v_member.id and attribute_key=p_attribute_key for update;
  select license_tier into v_license_tier from public.caleris_development_license_tier_mapping where license_label=trim(coalesce(v_member.license,'')) and is_active;
  if v_license_tier is null then raise exception 'Tier harga untuk lisensi Driver ini belum dipetakan oleh Admin.'; end if;
  select cash_eur_per_point into v_cash_rate from public.caleris_driver_development_tier_pricing where license_tier=v_license_tier and attribute_key=p_attribute_key and is_configured;
 end if;
 if v_attr_id is null then raise exception 'Atribut tidak ditemukan.'; end if;
 if p_new_value<=v_old then raise exception 'Upgrade harus menaikkan nilai atribut.'; end if;
 v_delta:=p_new_value-v_old;
 if v_delta<=0 then raise exception 'Perubahan nilai atribut tidak valid.'; end if;
 if p_payment_method='cash' then
  if v_cash_rate is null or v_cash_rate<=0 then raise exception 'Harga cash atribut belum dikonfigurasi Admin.'; end if;
  v_cash_cost:=round(v_delta*v_cash_rate,2);
  if p_scope='driver' then select id into v_cash_wallet_id from public.economy_wallet_accounts where account_kind='driver' and member_id=v_member.id and is_active for update;
  else select id into v_cash_wallet_id from public.economy_wallet_accounts where account_kind='team' and team_id=v_member.team_id and is_active for update; end if;
  if v_cash_wallet_id is null then raise exception 'Wallet cash untuk Development tidak ditemukan.'; end if;
  select id into v_treasury_id from public.economy_wallet_accounts where account_kind='development_shop' and is_active order by created_at limit 1 for update;
  if v_treasury_id is null then raise exception 'Development Treasury belum tersedia.'; end if;
  v_idempotency:='development-upgrade:'||md5(v_member.id::text||':'||p_scope||':'||p_attribute_key||':'||v_old::text||':'||p_new_value::text||':'||p_payment_method);
  v_tx:=private.post_economy_transaction(v_cash_wallet_id,v_treasury_id,v_cash_cost,'development_upgrade','Development upgrade · '||p_attribute_key,v_idempotency,p_actor_id,
   jsonb_build_object('member_id',v_member.id,'team_id',v_member.team_id,'scope',p_scope,'attribute_key',p_attribute_key,'previous_value',v_old,'new_value',p_new_value,'point_delta',v_delta,'cash_eur_per_point',v_cash_rate,'license_tier',v_license_tier,'team_division',v_team_division));
  select balance into v_cash_remaining from public.economy_wallet_accounts where id=v_cash_wallet_id;
 else
  v_token_cost:=v_delta;
  if p_scope='driver' then select * into v_dev from public.caleris_development_accounts where asset_type='DDP' and member_id=v_member.id for update;
  else select * into v_dev from public.caleris_development_accounts where asset_type='TDP' and team_id=v_member.team_id for update; end if;
  if v_dev.id is null then raise exception 'Saldo Development Token belum tersedia.'; end if;
  if v_dev.balance<v_token_cost then raise exception 'Saldo token Development tidak mencukupi.'; end if;
  update public.caleris_development_accounts set balance=balance-v_token_cost,updated_at=v_now where id=v_dev.id;
  insert into public.caleris_development_ledger(account_id,delta,source_type,description,idempotency_key,created_by,metadata)
  values(v_dev.id,-v_token_cost,'attribute_upgrade',initcap(p_scope)||' free Development reward: '||p_attribute_key,
   'attribute-upgrade:'||p_scope||':'||md5(v_member.id::text||':'||p_attribute_key||':'||v_old::text||':'||p_new_value::text),
   p_actor_id,jsonb_build_object('attribute_key',p_attribute_key,'previous_value',v_old,'new_value',p_new_value,'point_cost',v_token_cost,'payment_method','token','free_race_reward',true));
  v_token_remaining:=v_dev.balance-v_token_cost;
 end if;
 if p_scope='team' then
  update public.caleris_team_development_parts set current_value=p_new_value,updated_at=v_now,updated_by=p_actor_id where id=v_attr_id;
  insert into public.caleris_team_development_part_history(team_id,part_key,previous_value,new_value,tdp_spent,created_by,cash_eur_spent,payment_method)
  values(v_member.team_id,p_attribute_key,v_old,p_new_value,v_token_cost,p_actor_id,v_cash_cost,p_payment_method) returning id into v_history_id;
 else
  update public.caleris_driver_development_attributes set current_value=p_new_value,updated_at=v_now,updated_by=p_actor_id where id=v_attr_id;
  insert into public.caleris_driver_development_history(member_id,attribute_key,previous_value,new_value,ddp_spent,created_by,cash_eur_spent,payment_method)
  values(v_member.id,p_attribute_key,v_old,p_new_value,v_token_cost,p_actor_id,v_cash_cost,p_payment_method) returning id into v_history_id;
 end if;
 return jsonb_build_object('scope',p_scope,'attribute_key',p_attribute_key,'previous_value',v_old,'new_value',p_new_value,'point_delta',v_delta,'payment_method',p_payment_method,'cash_spent',v_cash_cost,'token_spent',v_token_cost,'remaining_cash',v_cash_remaining,'remaining_tokens',v_token_remaining,'transaction',v_tx,'history_id',v_history_id);
end;
$function$;
revoke all on function public.member_upgrade_development_attribute(uuid,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.member_upgrade_development_attribute(uuid,text,text,numeric,text) to service_role;
commit;