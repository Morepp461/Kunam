-- Main Event Team Owner division, engine ownership and opening capital.
begin;

alter table public.caleris_member_registrations
  add column if not exists initial_division text,
  add column if not exists engine_choice text,
  add column if not exists requested_engine_name text,
  add column if not exists selected_engine_id uuid references public.caleris_engines(id) on delete restrict;

alter table public.caleris_engines
  add column if not exists owner_team_id uuid references public.teams(id) on delete set null,
  add column if not exists asking_price numeric(20,2),
  add column if not exists is_for_sale boolean not null default false;

alter table public.caleris_member_registrations
  drop constraint if exists caleris_registration_engine_choice_check;
alter table public.caleris_member_registrations
  add constraint caleris_registration_engine_choice_check check (
    requested_role <> 'Owner'
    or (
      initial_division in ('premio','zwei')
      and engine_choice in ('new','buy')
      and (
        (engine_choice='new' and requested_engine_name is not null and selected_engine_id is null)
        or (engine_choice='buy' and requested_engine_name is null and selected_engine_id is not null)
      )
    )
  );

create index if not exists caleris_engines_marketplace_idx
  on public.caleris_engines(is_for_sale, owner_team_id) where is_for_sale;

-- Seed the VreeoBank reserve. This is the bank's opening balance, not a member wallet.
update public.economy_wallet_accounts
set balance=999999999999.00, updated_at=now()
where account_kind='vreeo_bank' and is_active;

create or replace function public.list_main_event_engine_marketplace()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_team_id uuid;
  v_result jsonb;
begin
  select m.team_id into v_team_id
  from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'name',e.name,'manufacturer',e.manufacturer,
    'country_of_origin',e.country_of_origin,'description',e.description,
    'asking_price',e.asking_price,'seller_team_id',e.owner_team_id,
    'seller_team_name',t.name
  ) order by e.asking_price,e.name),'[]'::jsonb)
  into v_result
  from public.caleris_engines e
  join public.teams t on t.id=e.owner_team_id
  where e.is_active and e.is_for_sale and e.owner_team_id is not null
    and e.owner_team_id is distinct from v_team_id
    and e.asking_price between 5000000 and 25000000;

  return v_result;
end;
$function$;

create or replace function public.team_list_owned_engines()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_team_id uuid;
  v_result jsonb;
begin
  select m.team_id into v_team_id
  from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid()) and m.role='Owner';
  if v_team_id is null then raise exception 'Akses Team Owner diperlukan.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'name',e.name,'asking_price',e.asking_price,
    'is_for_sale',e.is_for_sale
  ) order by e.created_at desc),'[]'::jsonb)
  into v_result
  from public.caleris_engines e
  where e.owner_team_id=v_team_id and e.is_active;
  return v_result;
end;
$function$;

create or replace function public.team_set_engine_sale_listing(
  p_engine_id uuid,
  p_is_for_sale boolean,
  p_asking_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_team_id uuid;
begin
  select m.team_id into v_team_id
  from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid()) and m.role='Owner';
  if v_team_id is null then raise exception 'Akses Team Owner diperlukan.'; end if;

  perform 1 from public.caleris_engines
  where id=p_engine_id and owner_team_id=v_team_id and is_active
  for update;
  if not found then raise exception 'Engine tidak dimiliki oleh tim ini.'; end if;

  if p_is_for_sale then
    if p_asking_price is null or p_asking_price<>round(p_asking_price,2)
      or p_asking_price not between 5000000 and 25000000 then
      raise exception 'Harga jual engine harus antara €5 juta dan €25 juta.';
    end if;
  end if;

  update public.caleris_engines
  set is_for_sale=p_is_for_sale,
      asking_price=case when p_is_for_sale then p_asking_price else null end
  where id=p_engine_id;

  return jsonb_build_object('ok',true,'is_for_sale',p_is_for_sale);
end;
$function$;

create or replace function public.submit_main_event_registration_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_division text;
  v_engine_choice text;
  v_engine_id uuid;
  v_engine_name text;
  v_count integer;
  v_result jsonb;
  v_registration_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Data pendaftaran tidak valid.'; end if;
  v_role:=p_payload->>'requested_role';

  if v_role='Owner' then
    v_division:=lower(btrim(coalesce(p_payload->>'initial_division','')));
    if v_division not in ('premio','zwei') then raise exception 'Pilih divisi awal yang valid.'; end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('main-event-division:'||v_division,0)
    );
    select
      (select count(*) from public.teams t where lower(t.division_key)=v_division)
      +
      (select count(*) from public.caleris_member_registrations r
       where r.requested_role='Owner' and r.status='pending'
         and r.initial_division=v_division)
    into v_count;

    if (v_division='premio' and v_count>=12) or (v_division='zwei' and v_count>=14) then
      raise exception 'Divisi yang dipilih sudah tidak memiliki slot pendaftaran.';
    end if;

    v_engine_choice:=p_payload->>'engine_choice';
    if v_engine_choice not in ('new','buy') then raise exception 'Pilih opsi Engine.'; end if;

    if v_engine_choice='new' then
      v_engine_name:=nullif(btrim(p_payload->>'requested_engine_name'),'');
      if v_engine_name is null or length(v_engine_name) not between 2 and 60 then
        raise exception 'Nama Engine wajib diisi (2–60 karakter).';
      end if;
      if exists(select 1 from public.caleris_engines where lower(name)=lower(v_engine_name)) then
        raise exception 'Nama Engine sudah digunakan.';
      end if;
    else
      v_engine_id:=nullif(p_payload->>'selected_engine_id','')::uuid;
      if v_engine_id is null or not exists(
        select 1 from public.caleris_engines e
        where e.id=v_engine_id and e.is_active and e.is_for_sale
          and e.owner_team_id is not null
          and e.asking_price between 5000000 and 25000000
      ) then
        raise exception 'Engine yang dipilih tidak tersedia untuk dibeli.';
      end if;
    end if;
  end if;

  v_result:=public.submit_main_event_registration(p_payload);
  v_registration_id:=(v_result->>'registration_id')::uuid;
  if v_role='Owner' then
    update public.caleris_member_registrations
    set initial_division=v_division,
        engine_choice=v_engine_choice,
        requested_engine_name=case when v_engine_choice='new' then v_engine_name else null end,
        selected_engine_id=case when v_engine_choice='buy' then v_engine_id else null end
    where id=v_registration_id and user_id=(select auth.uid()) and status='pending';
  end if;
  return v_result;
end;
$function$;

create or replace function public.admin_review_main_event_registration_v2(
  p_registration_id uuid,
  p_decision text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=(select auth.uid());
  v_registration public.caleris_member_registrations%rowtype;
  v_result jsonb;
  v_team_id uuid;
  v_team_wallet uuid;
  v_owner_wallet uuid;
  v_driver_wallet uuid;
  v_bank_wallet uuid;
  v_seller_wallet uuid;
  v_balance numeric;
  v_engine_id uuid;
  v_engine_owner uuid;
  v_engine_price numeric;
  v_count integer;
  v_division text;
begin
  if v_actor is null or not exists(select 1 from public.site_admins where user_id=v_actor) then
    raise exception 'Akses administrator diperlukan.';
  end if;
  select * into v_registration
  from public.caleris_member_registrations
  where id=p_registration_id
  for update;
  if not found or v_registration.status<>'pending' then
    raise exception 'Pendaftaran tidak ditemukan atau sudah diproses.';
  end if;

  if p_decision='reject' then
    return public.admin_review_member_registration(p_registration_id,p_decision,p_review_note);
  end if;
  if p_decision<>'approve' then raise exception 'Keputusan tidak valid.'; end if;

  if v_registration.requested_role='Owner' then
    v_division:=v_registration.initial_division;
    if v_division not in ('premio','zwei') then raise exception 'Divisi awal tidak valid.'; end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('main-event-division:'||v_division,0)
    );
    select
      (select count(*) from public.teams t where lower(t.division_key)=v_division)
      +
      (select count(*) from public.caleris_member_registrations r
       where r.requested_role='Owner' and r.status='pending'
         and r.initial_division=v_division and r.id<>p_registration_id)
    into v_count;
    if v_count >= case when v_division='premio' then 12 else 14 end then
      raise exception 'Divisi sudah penuh. Pendaftaran tidak dapat disetujui.';
    end if;

    if v_registration.engine_choice='buy' then
      select e.owner_team_id,e.asking_price into v_engine_owner,v_engine_price
      from public.caleris_engines e
      where e.id=v_registration.selected_engine_id and e.is_active and e.is_for_sale
        and e.owner_team_id is not null
      for update;
      if not found or v_engine_price not between 5000000 and 25000000 then
        raise exception 'Engine sudah tidak tersedia atau harga tidak valid.';
      end if;
    elsif v_registration.engine_choice<>'new'
      or nullif(btrim(v_registration.requested_engine_name),'') is null then
      raise exception 'Pilihan Engine pendaftaran tidak valid.';
    end if;
  end if;

  v_result:=public.admin_review_member_registration(p_registration_id,p_decision,p_review_note);

  if v_registration.requested_role='Driver' then
    select id into v_driver_wallet
    from public.economy_wallet_accounts
    where account_kind='driver'
      and member_id=(v_result->>'member_id')::uuid
      and is_active
    for update;
    select id into v_bank_wallet from public.economy_wallet_accounts
    where account_kind='vreeo_bank' and is_active order by created_at limit 1 for update;
    if v_driver_wallet is null or v_bank_wallet is null then
      raise exception 'Wallet Driver atau VreeoBank belum tersedia.';
    end if;
    perform private.post_economy_transaction(
      v_bank_wallet,v_driver_wallet,10000000,'bank_reward',
      'Main Event initial Driver capital','main-event-driver-capital:'||p_registration_id::text,
      v_actor,jsonb_build_object('registration_id',p_registration_id,'opening_capital',true),null,false
    );
  else
    v_team_id:=(v_result->>'team_id')::uuid;
    update public.teams set division_key=v_division where id=v_team_id;

    select id into v_team_wallet from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_team_id and is_active for update;
    select id into v_owner_wallet from public.economy_wallet_accounts
    where account_kind='team_owner'
      and member_id=(v_result->>'member_id')::uuid and is_active for update;
    select id into v_bank_wallet from public.economy_wallet_accounts
    where account_kind='vreeo_bank' and is_active order by created_at limit 1 for update;
    if v_team_wallet is null or v_owner_wallet is null or v_bank_wallet is null then
      raise exception 'Wallet Team, Owner, atau VreeoBank belum tersedia.';
    end if;

    v_balance:=case when v_division='premio' then 800000000 else 500000000 end;
    perform private.post_economy_transaction(
      v_bank_wallet,v_team_wallet,v_balance,'bank_reward',
      'Main Event initial team capital · '||upper(v_division),
      'main-event-team-capital:'||p_registration_id::text,
      v_actor,jsonb_build_object('registration_id',p_registration_id,'division',v_division,'opening_capital',true),null,false
    );

    if v_registration.engine_choice='new' then
      if exists(select 1 from public.caleris_engines where lower(name)=lower(v_registration.requested_engine_name)) then
        raise exception 'Nama Engine sudah digunakan.';
      end if;
      perform private.post_economy_transaction(
        v_team_wallet,v_bank_wallet,80000000,'admin_adjustment',
        'New Engine manufacturing · '||v_registration.requested_engine_name,
        'main-event-new-engine:'||p_registration_id::text,
        v_actor,jsonb_build_object('registration_id',p_registration_id,'engine_manufacturing',true),null,false
      );
      insert into public.caleris_engines(
        name,manufacturer,country_of_origin,description,is_active,owner_team_id
      ) values (
        v_registration.requested_engine_name,v_registration.team_name,
        v_registration.team_base_nation,
        'Engine manufactured for '||v_registration.team_name,true,v_team_id
      ) returning id into v_engine_id;
    else
      select owner_team_id,asking_price into v_engine_owner,v_engine_price
      from public.caleris_engines
      where id=v_registration.selected_engine_id and is_for_sale
        and owner_team_id is not null
      for update;
      if not found or v_engine_owner=v_team_id then raise exception 'Engine tidak lagi tersedia.'; end if;
      select id into v_seller_wallet from public.economy_wallet_accounts
      where account_kind='team' and team_id=v_engine_owner and is_active for update;
      if v_seller_wallet is null then raise exception 'Wallet tim penjual tidak ditemukan.'; end if;
      perform private.post_economy_transaction(
        v_team_wallet,v_seller_wallet,v_engine_price,'transfer',
        'Engine purchase · '||v_registration.team_name,
        'main-event-engine-purchase:'||p_registration_id::text,
        v_actor,jsonb_build_object('registration_id',p_registration_id,'engine_id',v_registration.selected_engine_id,'seller_team_id',v_engine_owner),null,false
      );
      update public.caleris_engines
      set owner_team_id=v_team_id,is_for_sale=false,asking_price=null
      where id=v_registration.selected_engine_id;
      v_engine_id:=v_registration.selected_engine_id;
    end if;

    insert into public.caleris_team_engines(season_id,team_id,engine_id,assigned_by)
    select s.id,v_team_id,v_engine_id,v_actor
    from public.license_seasons s
    where s.status='active'
    order by s.created_at desc
    limit 1
    on conflict(season_id,team_id) do update
      set engine_id=excluded.engine_id,assigned_at=now(),assigned_by=excluded.assigned_by;

    if v_registration.engine_choice='buy' then
      delete from public.caleris_team_engines
      where team_id=v_engine_owner and engine_id=v_engine_id
        and season_id in (select id from public.license_seasons where status='active');
    end if;
  end if;

  return v_result||jsonb_build_object('initial_capital',case
    when v_registration.requested_role='Driver' then 10000000
    when v_division='premio' then 800000000
    when v_division='zwei' then 500000000
    else 0 end,'engine_id',v_engine_id);
end;
$function$;

revoke all on function public.list_main_event_engine_marketplace() from public,anon;
revoke all on function public.team_list_owned_engines() from public,anon;
revoke all on function public.team_set_engine_sale_listing(uuid,boolean,numeric) from public,anon;
revoke all on function public.submit_main_event_registration_v2(jsonb) from public,anon;
revoke all on function public.admin_review_main_event_registration_v2(uuid,text,text) from public,anon;
grant execute on function public.list_main_event_engine_marketplace() to authenticated;
grant execute on function public.team_list_owned_engines() to authenticated;
grant execute on function public.team_set_engine_sale_listing(uuid,boolean,numeric) to authenticated;
grant execute on function public.submit_main_event_registration_v2(jsonb) to authenticated;
grant execute on function public.admin_review_main_event_registration_v2(uuid,text,text) to authenticated;

commit;
