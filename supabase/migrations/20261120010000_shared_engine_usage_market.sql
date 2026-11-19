alter table public.caleris_engines
  add column if not exists race_pace numeric not null default 50,
  add column if not exists qualifying_pace numeric not null default 50,
  add column if not exists engine_power numeric not null default 50;
alter table public.caleris_engines
  drop constraint if exists caleris_engines_race_pace_range,
  drop constraint if exists caleris_engines_qualifying_pace_range,
  drop constraint if exists caleris_engines_engine_power_range;
alter table public.caleris_engines
  add constraint caleris_engines_race_pace_range check (race_pace between 0 and 100),
  add constraint caleris_engines_qualifying_pace_range check (qualifying_pace between 0 and 100),
  add constraint caleris_engines_engine_power_range check (engine_power between 0 and 100);

update public.caleris_engines e
set race_pace=coalesce((select d.current_value from public.caleris_team_development_parts d where d.team_id=e.owner_team_id and d.part_key='race_pace'),e.race_pace),
    qualifying_pace=coalesce((select d.current_value from public.caleris_team_development_parts d where d.team_id=e.owner_team_id and d.part_key='qualifying_pace'),e.qualifying_pace),
    engine_power=coalesce((select d.current_value from public.caleris_team_development_parts d where d.team_id=e.owner_team_id and d.part_key='engine_power'),e.engine_power)
where e.owner_team_id is not null;

create table if not exists public.caleris_engine_usage_contracts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id),
  engine_id uuid not null references public.caleris_engines(id),
  owner_team_id uuid not null references public.teams(id),
  using_team_id uuid not null references public.teams(id),
  purchase_price numeric not null check (purchase_price > 0),
  transaction_id uuid not null references public.economy_transactions(id),
  status text not null default 'active' check (status in ('active','replaced','expired')),
  purchased_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists caleris_engine_usage_contracts_engine_idx
  on public.caleris_engine_usage_contracts(engine_id,season_id,status);
create unique index if not exists caleris_engine_usage_contracts_one_active_team_season
  on public.caleris_engine_usage_contracts(season_id,using_team_id) where status='active';
alter table public.caleris_engine_usage_contracts enable row level security;
revoke all on public.caleris_engine_usage_contracts from anon,authenticated;

create or replace function public.admin_list_engine_marketplace()
returns table(id uuid,name text,manufacturer text,country_of_origin text,description text,
  owner_team_id uuid,owner_team_name text,is_for_sale boolean,asking_price numeric,
  race_pace numeric,qualifying_pace numeric,engine_power numeric)
language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then
    raise exception 'Akses Admin diperlukan.';
  end if;
  return query
  select e.id,e.name,e.manufacturer,e.country_of_origin,e.description,e.owner_team_id,t.name,
    e.is_for_sale,e.asking_price,e.race_pace,e.qualifying_pace,e.engine_power
  from public.caleris_engines e
  left join public.teams t on t.id=e.owner_team_id
  where e.is_active order by e.name;
end;
$$;

create or replace function public.admin_configure_engine_usage_offer(
  p_engine_id uuid,p_is_listed boolean,p_usage_price numeric default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then
    raise exception 'Hanya Admin yang dapat mengatur harga dan listing Engine Market.';
  end if;
  if p_is_listed and (p_usage_price is null or p_usage_price<>round(p_usage_price,2)
    or p_usage_price not between 5000000 and 25000000) then
    raise exception 'Harga penggunaan Engine harus antara €5 juta dan €25 juta.';
  end if;
  update public.caleris_engines
  set is_for_sale=p_is_listed,asking_price=case when p_is_listed then p_usage_price else null end
  where id=p_engine_id and is_active;
  if not found then raise exception 'Engine aktif tidak ditemukan.'; end if;
  return jsonb_build_object('ok',true,'listed',p_is_listed,'usage_price',p_usage_price);
end;
$$;

create or replace function public.team_set_engine_sale_listing(
  p_engine_id uuid,p_is_for_sale boolean,p_asking_price numeric default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
begin
  raise exception 'Harga dan listing Engine Market hanya dapat diatur oleh Admin.';
end;
$$;

create or replace function public.team_list_owned_engines()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_team_id uuid; v_result jsonb;
begin
  select m.team_id into v_team_id from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid()) and m.role='Owner';
  if v_team_id is null then raise exception 'Akses Team Owner diperlukan.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'name',e.name,'asking_price',e.asking_price,'is_for_sale',e.is_for_sale,
    'race_pace',e.race_pace,'qualifying_pace',e.qualifying_pace,'engine_power',e.engine_power,
    'active_usage_count',(select count(*) from public.caleris_engine_usage_contracts u where u.engine_id=e.id and u.status='active')
  ) order by e.created_at desc),'[]'::jsonb)
  into v_result from public.caleris_engines e where e.owner_team_id=v_team_id and e.is_active;
  return v_result;
end;
$$;

create or replace function public.list_main_event_engine_marketplace()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_team_id uuid; v_result jsonb;
begin
  select m.team_id into v_team_id from public.profiles p
  join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'name',e.name,'manufacturer',e.manufacturer,
    'country_of_origin',e.country_of_origin,'description',e.description,
    'asking_price',e.asking_price,'seller_team_id',e.owner_team_id,'seller_team_name',t.name,
    'race_pace',e.race_pace,'qualifying_pace',e.qualifying_pace,'engine_power',e.engine_power,
    'active_usage_count',(select count(*) from public.caleris_engine_usage_contracts u where u.engine_id=e.id and u.status='active')
  ) order by e.asking_price,e.name),'[]'::jsonb)
  into v_result from public.caleris_engines e
  join public.teams t on t.id=e.owner_team_id
  where e.is_active and e.is_for_sale and e.owner_team_id is not null
    and e.owner_team_id is distinct from v_team_id
    and e.asking_price between 5000000 and 25000000;
  return v_result;
end;
$$;

create or replace function public.team_purchase_engine_usage(
  p_engine_id uuid,p_season_id uuid,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=(select auth.uid());
  v_member public.members%rowtype;
  v_engine public.caleris_engines%rowtype;
  v_season public.license_seasons%rowtype;
  v_buyer_wallet public.economy_wallet_accounts%rowtype;
  v_owner_wallet public.economy_wallet_accounts%rowtype;
  v_tx jsonb;
  v_existing public.economy_transactions%rowtype;
  v_contract_id uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then
    raise exception 'Kunci transaksi tidak valid.';
  end if;
  select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=v_user for update of m;
  if not found or v_member.role<>'Owner' or v_member.team_id is null then
    raise exception 'Hanya Team Owner yang dapat membeli hak penggunaan Engine.';
  end if;
  select * into v_season from public.license_seasons where id=p_season_id and status='active';
  if not found then raise exception 'Season harus berstatus aktif.'; end if;
  select * into v_existing from public.economy_transactions where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.metadata->>'engine_id' is distinct from p_engine_id::text
      or v_existing.metadata->>'using_team_id' is distinct from v_member.team_id::text
      or v_existing.metadata->>'season_id' is distinct from p_season_id::text then
      raise exception 'Kunci transaksi telah digunakan untuk pembelian Engine lain.';
    end if;
    select id into v_contract_id from public.caleris_engine_usage_contracts
    where transaction_id=v_existing.id;
    if v_contract_id is not null then
      return jsonb_build_object('status','duplicate','contract_id',v_contract_id,'transaction_id',v_existing.id);
    end if;
    raise exception 'Transaksi Engine ditemukan tanpa kontrak penggunaan. Hubungi Admin untuk rekonsiliasi.';
  end if;
  select * into v_engine from public.caleris_engines
  where id=p_engine_id and is_active and is_for_sale for update;
  if not found then raise exception 'Engine tidak tersedia di Engine Market.'; end if;
  if v_engine.owner_team_id is null or v_engine.owner_team_id=v_member.team_id then
    raise exception 'Engine ini bukan listing penggunaan dari tim lain.';
  end if;
  if exists(select 1 from public.caleris_team_engines where season_id=p_season_id and team_id=v_member.team_id and engine_id=p_engine_id) then
    return jsonb_build_object('status','already_assigned','engine_id',p_engine_id);
  end if;
  select * into v_buyer_wallet from public.economy_wallet_accounts
  where account_kind='team' and team_id=v_member.team_id and is_active for update;
  if not found then raise exception 'Team Wallet pembeli tidak tersedia.'; end if;
  select * into v_owner_wallet from public.economy_wallet_accounts
  where account_kind='team' and team_id=v_engine.owner_team_id and is_active for update;
  if not found then raise exception 'Team Wallet pemilik Engine tidak tersedia.'; end if;

  v_tx:=private.post_economy_transaction(
    v_buyer_wallet.id,v_owner_wallet.id,v_engine.asking_price,'engine_usage_purchase',
    'Pembelian hak penggunaan Engine '||v_engine.name,p_idempotency_key,v_user,
    jsonb_build_object('engine_id',v_engine.id,'owner_team_id',v_engine.owner_team_id,
      'using_team_id',v_member.team_id,'season_id',p_season_id,
      'race_pace',v_engine.race_pace,'qualifying_pace',v_engine.qualifying_pace,'engine_power',v_engine.engine_power),
    null,false
  );

  update public.caleris_engine_usage_contracts set status='replaced',ended_at=now()
  where season_id=p_season_id and using_team_id=v_member.team_id and status='active';
  insert into public.caleris_engine_usage_contracts(
    season_id,engine_id,owner_team_id,using_team_id,purchase_price,transaction_id,created_by
  ) values(p_season_id,v_engine.id,v_engine.owner_team_id,v_member.team_id,v_engine.asking_price,
    (v_tx->>'transaction_id')::uuid,v_user) returning id into v_contract_id;

  insert into public.caleris_team_engines(season_id,team_id,engine_id,assigned_by)
  values(p_season_id,v_member.team_id,v_engine.id,v_user)
  on conflict(season_id,team_id) do update set engine_id=excluded.engine_id,assigned_at=now(),assigned_by=excluded.assigned_by;

  return jsonb_build_object('status','purchased','contract_id',v_contract_id,
    'engine_id',v_engine.id,'owner_team_id',v_engine.owner_team_id,
    'race_pace',v_engine.race_pace,'qualifying_pace',v_engine.qualifying_pace,'engine_power',v_engine.engine_power);
end;
$$;

revoke all on function public.admin_list_engine_marketplace() from public;
revoke all on function public.admin_configure_engine_usage_offer(uuid,boolean,numeric) from public;
revoke all on function public.team_purchase_engine_usage(uuid,uuid,text) from public;
grant execute on function public.admin_list_engine_marketplace() to authenticated;
grant execute on function public.admin_configure_engine_usage_offer(uuid,boolean,numeric) to authenticated;
grant execute on function public.team_purchase_engine_usage(uuid,uuid,text) to authenticated;
