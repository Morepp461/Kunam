-- Central economy pricing controls.
-- Preserve current behavior: development attribute upgrades remain 1 token per point until Admin changes the rates.

create table if not exists public.caleris_driver_development_pricing (
  attribute_key text primary key check (attribute_key in (
    'race_pace','qualifying_pace','experience','aggression',
    'defensive_strength','overtake_skill','mistake_rate','tyre_management'
  )),
  ddp_per_point numeric(12,2) not null check (ddp_per_point >= 0),
  is_configured boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.caleris_driver_development_pricing(attribute_key,ddp_per_point,is_configured)
values
 ('race_pace',1,true),('qualifying_pace',1,true),('experience',1,true),
 ('aggression',1,true),('defensive_strength',1,true),('overtake_skill',1,true),
 ('mistake_rate',1,true),('tyre_management',1,true)
on conflict(attribute_key) do nothing;

alter table public.caleris_driver_development_pricing enable row level security;
revoke all on public.caleris_driver_development_pricing from public,anon,authenticated;
grant select on public.caleris_driver_development_pricing to authenticated;
grant insert,update,delete on public.caleris_driver_development_pricing to authenticated;
drop policy if exists "Driver development pricing readable by authenticated" on public.caleris_driver_development_pricing;
create policy "Driver development pricing readable by authenticated"
on public.caleris_driver_development_pricing for select to authenticated using(true);
drop policy if exists "Admins manage driver development pricing" on public.caleris_driver_development_pricing;
create policy "Admins manage driver development pricing"
on public.caleris_driver_development_pricing for all to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

-- Existing TDP and loan-rate tables are readable by members; only Admin can change their values.
grant insert,update,delete on public.caleris_team_development_pricing to authenticated;
drop policy if exists "Admins manage team development pricing" on public.caleris_team_development_pricing;
create policy "Admins manage team development pricing"
on public.caleris_team_development_pricing for all to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

grant insert,update,delete on public.economy_cash_loan_interest_rates to authenticated;
drop policy if exists "Admins manage cash loan interest rates" on public.economy_cash_loan_interest_rates;
create policy "Admins manage cash loan interest rates"
on public.economy_cash_loan_interest_rates for all to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function public.member_upgrade_development_attribute(
 p_actor_id uuid,p_scope text,p_attribute_key text,p_new_value numeric
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_member public.members%rowtype; v_profile public.profiles%rowtype;
 v_old numeric(5,2); v_cost numeric(20,2); v_rate numeric(12,2);
 v_account public.caleris_development_accounts%rowtype;
 v_attr_id uuid; v_history_id uuid; v_now timestamptz:=now();
begin
 if p_scope not in ('team','driver') then raise exception 'Scope development tidak valid.'; end if;
 if p_new_value is null or p_new_value<50 or p_new_value>100 or p_new_value<>round(p_new_value,2) then raise exception 'Nilai atribut harus 50 sampai 100.'; end if;
 select * into v_profile from public.profiles where user_id=p_actor_id;
 if not found or v_profile.member_id is null then raise exception 'Profil member tidak ditemukan.'; end if;
 select * into v_member from public.members where id=v_profile.member_id;
 if p_scope='team' then
  if v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Hanya Owner atau Principal tim yang dapat upgrade atribut tim.'; end if;
  select current_value,id into v_old,v_attr_id from public.caleris_team_development_parts where team_id=v_member.team_id and part_key=p_attribute_key for update;
  select tdp_per_point into v_rate from public.caleris_team_development_pricing where part_key=p_attribute_key and is_configured;
 else
  if v_member.role<>'Driver' then raise exception 'Hanya Driver yang dapat upgrade atribut driver.'; end if;
  select current_value,id into v_old,v_attr_id from public.caleris_driver_development_attributes where member_id=v_member.id and attribute_key=p_attribute_key for update;
  select ddp_per_point into v_rate from public.caleris_driver_development_pricing where attribute_key=p_attribute_key and is_configured;
 end if;
 if v_attr_id is null then raise exception 'Atribut tidak ditemukan.'; end if;
 if v_rate is null or v_rate<0 then raise exception 'Harga upgrade atribut belum dikonfigurasi Admin.'; end if;
 if p_new_value<=v_old then raise exception 'Upgrade harus menaikkan nilai atribut.'; end if;
 v_cost:=round((p_new_value-v_old)*v_rate,2);
 select * into v_account from public.caleris_development_accounts
 where (p_scope='team' and asset_type='TDP' and team_id=v_member.team_id)
    or (p_scope='driver' and asset_type='DDP' and member_id=v_member.id)
 for update;
 if v_account.id is null then raise exception 'Development wallet belum tersedia.'; end if;
 if v_account.balance<v_cost then raise exception 'Saldo development point tidak mencukupi.'; end if;
 update public.caleris_development_accounts set balance=balance-v_cost,updated_at=v_now where id=v_account.id;
 insert into public.caleris_development_ledger(account_id,delta,source_type,description,idempotency_key,created_by,metadata)
 values(v_account.id,-v_cost,'attribute_upgrade',initcap(p_scope)||' attribute upgrade: '||p_attribute_key,
 'attribute-upgrade:'||p_scope||':'||gen_random_uuid()::text,p_actor_id,
 jsonb_build_object('attribute_key',p_attribute_key,'previous_value',v_old,'new_value',p_new_value,
 'point_delta',p_new_value-v_old,'price_per_point',v_rate,'point_cost',v_cost));
 if p_scope='team' then
  update public.caleris_team_development_parts set current_value=p_new_value,updated_at=v_now,updated_by=p_actor_id where id=v_attr_id;
  insert into public.caleris_team_development_part_history(team_id,part_key,previous_value,new_value,tdp_spent,created_by)
  values(v_member.team_id,p_attribute_key,v_old,p_new_value,v_cost,p_actor_id) returning id into v_history_id;
 else
  update public.caleris_driver_development_attributes set current_value=p_new_value,updated_at=v_now,updated_by=p_actor_id where id=v_attr_id;
  insert into public.caleris_driver_development_history(member_id,attribute_key,previous_value,new_value,ddp_spent,created_by)
  values(v_member.id,p_attribute_key,v_old,p_new_value,v_cost,p_actor_id) returning id into v_history_id;
 end if;
 return jsonb_build_object('scope',p_scope,'attribute_key',p_attribute_key,'previous_value',v_old,
 'new_value',p_new_value,'price_per_point',v_rate,'point_cost',v_cost,
 'remaining_balance',v_account.balance-v_cost,'history_id',v_history_id);
end;
$function$;

revoke all on function public.member_upgrade_development_attribute(uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.member_upgrade_development_attribute(uuid,text,text,numeric) to service_role;
