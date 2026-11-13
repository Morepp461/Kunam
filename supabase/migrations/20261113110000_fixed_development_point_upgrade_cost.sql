-- Fixed 1:1 development point pricing for teams and drivers.
update public.caleris_team_development_pricing
set tdp_per_point=1,is_configured=true,updated_at=now();

create table if not exists public.caleris_driver_development_attributes (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.members(id) on delete cascade,
 attribute_key text not null check(attribute_key in ('race_pace','qualifying_pace','experience','aggression','defensive_strength','overtake_skill','mistake_rate','tyre_management')),
 current_value numeric(5,2) not null default 50 check(current_value between 50 and 100),
 updated_at timestamptz not null default now(),
 updated_by uuid,
 unique(member_id,attribute_key)
);
create table if not exists public.caleris_driver_development_history (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.members(id) on delete cascade,
 attribute_key text not null,
 previous_value numeric(5,2) not null,
 new_value numeric(5,2) not null check(new_value between 50 and 100),
 ddp_spent numeric(20,2) not null check(ddp_spent>=0),
 created_by uuid,
 created_at timestamptz not null default now(),
 note text
);
insert into public.caleris_driver_development_attributes(member_id,attribute_key)
select m.id,a.attribute_key from public.members m cross join
(select unnest(array['race_pace','qualifying_pace','experience','aggression','defensive_strength','overtake_skill','mistake_rate','tyre_management']) attribute_key) a
where m.role='Driver' on conflict(member_id,attribute_key) do nothing;

alter table public.caleris_driver_development_attributes enable row level security;
alter table public.caleris_driver_development_history enable row level security;
drop policy if exists driver_development_attributes_read on public.caleris_driver_development_attributes;
create policy driver_development_attributes_read on public.caleris_driver_development_attributes for select to authenticated using(
 exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.member_id=member_id)
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and m.role='Admin')
);
drop policy if exists driver_development_history_read on public.caleris_driver_development_history;
create policy driver_development_history_read on public.caleris_driver_development_history for select to authenticated using(
 exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.member_id=member_id)
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and m.role='Admin')
);
grant select on public.caleris_driver_development_attributes,public.caleris_driver_development_history to authenticated;

create or replace function public.member_upgrade_development_attribute(p_actor_id uuid,p_scope text,p_attribute_key text,p_new_value numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.members%rowtype; v_profile public.profiles%rowtype; v_team_id uuid; v_member_id uuid;
 v_old numeric(5,2); v_cost numeric(20,2); v_account public.caleris_development_accounts%rowtype;
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
 else
  if v_member.role<>'Driver' then raise exception 'Hanya Driver yang dapat upgrade atribut driver.'; end if;
  select current_value,id into v_old,v_attr_id from public.caleris_driver_development_attributes where member_id=v_member.id and attribute_key=p_attribute_key for update;
 end if;
 if v_attr_id is null then raise exception 'Atribut tidak ditemukan.'; end if;
 if p_new_value<=v_old then raise exception 'Upgrade harus menaikkan nilai atribut.'; end if;
 v_cost:=p_new_value-v_old;
 if p_scope='team' then
  select * into v_account from public.caleris_development_accounts where asset_type='TDP' and team_id=v_member.team_id for update;
 else
  select * into v_account from public.caleris_development_accounts where asset_type='DDP' and member_id=v_member.id for update;
 end if;
 if v_account.id is null then raise exception 'Development wallet belum tersedia.'; end if;
 if v_account.balance<v_cost then raise exception 'Saldo development point tidak mencukupi.'; end if;
 update public.caleris_development_accounts set balance=balance-v_cost,updated_at=v_now where id=v_account.id;
 insert into public.caleris_development_ledger(account_id,delta,source_type,description,idempotency_key,created_by,metadata)
 values(v_account.id,-v_cost,'attribute_upgrade',initcap(p_scope)||' attribute upgrade: '||p_attribute_key,
 'attribute-upgrade:'||p_scope||':'||gen_random_uuid()::text,p_actor_id,
 jsonb_build_object('attribute_key',p_attribute_key,'previous_value',v_old,'new_value',p_new_value,'point_cost',v_cost));
 if p_scope='team' then
  update public.caleris_team_development_parts set current_value=p_new_value,updated_at=v_now,updated_by=p_actor_id where id=v_attr_id;
  insert into public.caleris_team_development_part_history(team_id,part_key,previous_value,new_value,tdp_spent,created_by)
  values(v_member.team_id,p_attribute_key,v_old,p_new_value,v_cost,p_actor_id) returning id into v_history_id;
 else
  update public.caleris_driver_development_attributes set current_value=p_new_value,updated_at=v_now,updated_by=p_actor_id where id=v_attr_id;
  insert into public.caleris_driver_development_history(member_id,attribute_key,previous_value,new_value,ddp_spent,created_by)
  values(v_member.id,p_attribute_key,v_old,p_new_value,v_cost,p_actor_id) returning id into v_history_id;
 end if;
 return jsonb_build_object('scope',p_scope,'attribute_key',p_attribute_key,'previous_value',v_old,'new_value',p_new_value,'point_cost',v_cost,'remaining_balance',v_account.balance-v_cost,'history_id',v_history_id);
end; $$;
grant execute on function public.member_upgrade_development_attribute(uuid,text,text,numeric) to service_role;