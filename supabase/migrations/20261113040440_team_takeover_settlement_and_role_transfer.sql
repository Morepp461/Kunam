begin;

alter table public.caleris_team_takeovers
  add column if not exists transaction_id uuid references public.economy_transactions(id) on delete restrict,
  add column if not exists settled_at timestamptz;

create unique index if not exists caleris_team_takeovers_transaction_unique
  on public.caleris_team_takeovers(transaction_id)
  where transaction_id is not null;

create unique index if not exists members_one_team_owner_per_team
  on public.members(team_id)
  where role='Owner' and team_id is not null;

create or replace function public.member_set_team_takeover_listing(p_is_listed boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_member public.members%rowtype;
  v_valuation_id uuid;
begin
  if p_is_listed is null then raise exception 'Status listing tidak valid.'; end if;

  select m.* into v_member
  from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid())
  for update of m;

  if not found or v_member.role<>'Owner' or v_member.team_id is null then
    raise exception 'Hanya Team Owner yang dapat mengelola listing Take Over.';
  end if;

  if p_is_listed then
    select id into v_valuation_id
    from public.caleris_team_valuations
    where team_id=v_member.team_id
    order by assessed_at desc,id desc
    limit 1;
    if v_valuation_id is null then
      raise exception 'Admin harus membuat valuation snapshot tim sebelum listing dibuka.';
    end if;
  end if;

  update public.teams set takeover_listed=p_is_listed where id=v_member.team_id;
  return jsonb_build_object('team_id',v_member.team_id,'takeover_listed',p_is_listed,'valuation_id',v_valuation_id);
end;
$$;

create or replace function public.member_start_team_takeover(
  p_target_team_id uuid,
  p_offer_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor public.members%rowtype;
  v_target public.teams%rowtype;
  v_seller public.members%rowtype;
  v_valuation public.caleris_team_valuations%rowtype;
  v_range public.caleris_configurations%rowtype;
  v_min numeric;
  v_max numeric;
  v_id uuid;
begin
  select m.* into v_actor
  from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid())
  for update of m;

  if not found or (v_actor.role is not null and v_actor.role not in ('Driver','FIA')) then
    raise exception 'Pembeli hanya dapat berstatus Public Member, Driver, atau FIA.';
  end if;

  if p_target_team_id is null then raise exception 'Tim target wajib dipilih.'; end if;
  if p_offer_amount is null or p_offer_amount<=0 or p_offer_amount<>round(p_offer_amount,2) then
    raise exception 'Nominal penawaran tidak valid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target_team_id::text,0));

  select * into v_target
  from public.teams
  where id=p_target_team_id and takeover_listed
  for update;

  if not found then raise exception 'Tim target tidak sedang membuka Take Over.'; end if;

  select * into v_seller
  from public.members
  where team_id=p_target_team_id and role='Owner'
  order by id
  limit 1
  for update;

  if not found then raise exception 'Tim target belum memiliki Team Owner.'; end if;
  if v_seller.id=v_actor.id then raise exception 'Tidak dapat mengambil alih tim sendiri.'; end if;

  select * into v_valuation
  from public.caleris_team_valuations
  where team_id=p_target_team_id
  order by assessed_at desc,id desc
  limit 1;

  if not found then raise exception 'Tim target belum memiliki valuation snapshot.'; end if;

  select * into v_range
  from public.caleris_configurations
  where category='economy'
    and config_key='team-takeover-valuation-range'
    and is_active;

  v_min:=nullif(v_range.payload->>'minimum_percent','')::numeric;
  v_max:=nullif(v_range.payload->>'maximum_percent','')::numeric;

  if v_min is null or v_max is null or v_min<0 or v_max<v_min then
    raise exception 'Admin belum mengatur rentang valuasi Take Over.';
  end if;

  if p_offer_amount<v_valuation.total_valuation*v_min/100
    or p_offer_amount>v_valuation.total_valuation*v_max/100 then
    raise exception 'Penawaran harus berada dalam rentang valuasi yang dikonfigurasi Admin (%–% dari valuasi).',v_min,v_max;
  end if;

  if exists(
    select 1 from public.caleris_team_takeovers
    where target_team_id=p_target_team_id
      and status in ('offered','negotiating','seller_accepted','pending_fia','approved')
  ) then
    raise exception 'Tim ini sudah memiliki negosiasi Take Over yang berjalan.';
  end if;

  insert into public.caleris_team_takeovers(
    target_team_id,buyer_member_id,seller_member_id,valuation_id,status
  )
  values(p_target_team_id,v_actor.id,v_seller.id,v_valuation.id,'offered')
  returning id into v_id;

  insert into public.caleris_team_takeover_offers(
    takeover_id,offered_by_member_id,offered_amount,note
  )
  values(v_id,v_actor.id,p_offer_amount,nullif(trim(p_note),''));

  return v_id;
end;
$$;

create or replace function public.member_respond_team_takeover(
  p_takeover_id uuid,
  p_action text,
  p_amount numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor public.members%rowtype;
  v_take public.caleris_team_takeovers%rowtype;
  v_last public.caleris_team_takeover_offers%rowtype;
  v_limits public.caleris_configurations%rowtype;
  v_range public.caleris_configurations%rowtype;
  v_max_side integer;
  v_max_total integer;
  v_min numeric;
  v_max numeric;
  v_side_count integer;
begin
  select m.* into v_actor
  from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid())
  for update of m;

  if not found then raise exception 'Akun belum terhubung ke member.'; end if;

  select * into v_take
  from public.caleris_team_takeovers
  where id=p_takeover_id
  for update;

  if not found or v_take.status not in ('offered','negotiating') then
    raise exception 'Negosiasi Take Over tidak tersedia.';
  end if;

  if v_actor.id not in (v_take.buyer_member_id,v_take.seller_member_id) then
    raise exception 'Kamu bukan pihak dalam negosiasi ini.';
  end if;

  select * into v_last
  from public.caleris_team_takeover_offers
  where takeover_id=v_take.id
  order by created_at desc,id desc
  limit 1
  for update;

  if v_last.id is null or v_last.offered_by_member_id=v_actor.id then
    raise exception 'Pihak yang sama tidak dapat merespons penawarannya sendiri.';
  end if;

  if p_action='reject' then
    update public.caleris_team_takeover_offers
    set response='rejected'
    where id=v_last.id;

    update public.caleris_team_takeovers
    set status='rejected',updated_at=now()
    where id=v_take.id;

    return jsonb_build_object('status','rejected');

  elsif p_action='accept' then
    update public.caleris_team_takeover_offers
    set response='accepted'
    where id=v_last.id;

    update public.caleris_team_takeovers
    set status='pending_fia',agreed_amount=v_last.offered_amount,updated_at=now()
    where id=v_take.id;

    return jsonb_build_object('status','pending_fia','agreed_amount',v_last.offered_amount);

  elsif p_action='counter' then
    select * into v_limits
    from public.caleris_configurations
    where category='economy'
      and config_key='team-takeover-negotiation-limits'
      and is_active;

    v_max_side:=nullif(v_limits.payload->>'max_counters_per_side','')::integer;
    v_max_total:=nullif(v_limits.payload->>'max_total_counters','')::integer;

    if v_max_side is null or v_max_total is null or v_max_side<0 or v_max_total<0 then
      raise exception 'Admin belum mengatur batas counter-offer Take Over.';
    end if;

    if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then
      raise exception 'Nominal counter-offer tidak valid.';
    end if;

    select * into v_range
    from public.caleris_configurations
    where category='economy'
      and config_key='team-takeover-valuation-range'
      and is_active;

    v_min:=nullif(v_range.payload->>'minimum_percent','')::numeric;
    v_max:=nullif(v_range.payload->>'maximum_percent','')::numeric;

    if v_min is null or v_max is null or v_min<0 or v_max<v_min then
      raise exception 'Admin belum mengatur rentang valuasi Take Over dengan benar.';
    end if;

    if p_amount<(select total_valuation from public.caleris_team_valuations where id=v_take.valuation_id)*v_min/100
      or p_amount>(select total_valuation from public.caleris_team_valuations where id=v_take.valuation_id)*v_max/100 then
      raise exception 'Counter-offer berada di luar rentang valuasi yang dikonfigurasi Admin.';
    end if;

    select count(*) into v_side_count
    from public.caleris_team_takeover_offers
    where takeover_id=v_take.id
      and offered_by_member_id=v_actor.id;

    if v_actor.id=v_take.buyer_member_id then
      v_side_count:=greatest(v_side_count-1,0);
    end if;

    if v_side_count>=v_max_side or v_take.total_counteroffers>=v_max_total then
      raise exception 'Batas negosiasi ulang telah tercapai.';
    end if;

    update public.caleris_team_takeover_offers
    set response='countered'
    where id=v_last.id;

    insert into public.caleris_team_takeover_offers(
      takeover_id,offered_by_member_id,offered_amount,note
    )
    values(v_take.id,v_actor.id,p_amount,nullif(trim(p_note),'')); 

    update public.caleris_team_takeovers
    set status='negotiating',
        total_counteroffers=total_counteroffers+1,
        updated_at=now()
    where id=v_take.id;

    return jsonb_build_object('status','negotiating','counteroffers',v_take.total_counteroffers+1);
  else
    raise exception 'Action negosiasi tidak dikenal.';
  end if;
end;
$$;

create or replace function public.fia_review_team_takeover(
  p_takeover_id uuid,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_take public.caleris_team_takeovers%rowtype;
  v_buyer public.members%rowtype;
  v_seller public.members%rowtype;
  v_team public.teams%rowtype;
  v_reviewer_member_id uuid;
  v_buyer_wallet_id uuid;
  v_seller_wallet_id uuid;
  v_transaction jsonb;
begin
  if not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat meninjau Take Over.';
  end if;

  select * into v_take
  from public.caleris_team_takeovers
  where id=p_takeover_id
  for update;

  if not found or v_take.status<>'pending_fia' then
    raise exception 'Take Over belum siap ditinjau FIA.';
  end if;

  select member_id into v_reviewer_member_id
  from public.profiles
  where user_id=(select auth.uid());

  if v_reviewer_member_id in (v_take.buyer_member_id,v_take.seller_member_id)
    and not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then
    raise exception 'Pihak yang terlibat tidak dapat meninjau Take Over sendiri.';
  end if;

  if not p_approve then
    update public.caleris_team_takeovers
    set status='rejected',updated_at=now()
    where id=v_take.id;

    return jsonb_build_object('status','rejected');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_take.target_team_id::text,0));

  select * into v_team
  from public.teams
  where id=v_take.target_team_id
  for update;

  perform 1
  from public.members
  where id in (v_take.buyer_member_id,v_take.seller_member_id)
  order by id
  for update;

  select * into v_buyer from public.members where id=v_take.buyer_member_id;
  select * into v_seller from public.members where id=v_take.seller_member_id;

  if v_team.id is null or v_buyer.id is null or v_seller.id is null then
    raise exception 'Data tim atau member Take Over tidak lengkap.';
  end if;

  if (v_buyer.role is not null and v_buyer.role not in ('Driver','FIA'))
    or v_seller.role<>'Owner'
    or v_seller.team_id<>v_take.target_team_id then
    raise exception 'Status pembeli atau kepemilikan tim sudah berubah. Take Over tidak dapat diselesaikan.';
  end if;

  if v_take.agreed_amount is null or v_take.agreed_amount<=0 then
    raise exception 'Harga kesepakatan Take Over tidak valid.';
  end if;

  if v_buyer.role='Driver' then
    select id into v_buyer_wallet_id
    from public.economy_wallet_accounts
    where member_id=v_buyer.id and account_kind='driver' and is_active;
  else
    select wa.id into v_buyer_wallet_id
    from public.profiles p
    join public.economy_wallet_accounts wa
      on wa.profile_user_id=p.user_id
     and wa.account_kind='public_member'
     and wa.is_active
    where p.member_id=v_buyer.id;
  end if;

  select id into v_seller_wallet_id
  from public.economy_wallet_accounts
  where member_id=v_seller.id and account_kind='team_owner' and is_active;

  if v_buyer_wallet_id is null or v_seller_wallet_id is null then
    raise exception 'Personal wallet pembeli atau Team Owner wallet penjual tidak ditemukan.';
  end if;

  v_transaction:=private.post_economy_transaction(
    v_buyer_wallet_id,
    v_seller_wallet_id,
    v_take.agreed_amount,
    'transfer',
    'Team Take Over payment · '||v_team.name,
    'team-takeover:'||v_take.id::text,
    (select auth.uid()),
    jsonb_build_object(
      'takeover_id',v_take.id,
      'team_id',v_team.id,
      'buyer_member_id',v_buyer.id,
      'seller_member_id',v_seller.id,
      'valuation_id',v_take.valuation_id
    ),
    null,
    false
  );

  update public.members set role=null,team_id=null where id=v_seller.id;
  update public.members set role='Owner',team_id=v_team.id where id=v_buyer.id;
  update public.teams set takeover_listed=false where id=v_team.id;

  update public.caleris_team_takeovers
  set status='completed',
      transaction_id=(v_transaction->>'transaction_id')::uuid,
      settled_at=now(),
      updated_at=now()
  where id=v_take.id;

  update public.caleris_team_takeovers
  set status='cancelled',updated_at=now()
  where buyer_member_id=v_buyer.id
    and id<>v_take.id
    and status in ('offered','negotiating','seller_accepted','pending_fia','approved');

  return jsonb_build_object(
    'status','completed',
    'takeover_id',v_take.id,
    'transaction_id',v_transaction->>'transaction_id',
    'buyer_member_id',v_buyer.id,
    'seller_member_id',v_seller.id,
    'team_id',v_team.id,
    'agreed_amount',v_take.agreed_amount
  );
end;
$$;

revoke all on function public.member_set_team_takeover_listing(boolean) from public,anon,service_role;
grant execute on function public.member_set_team_takeover_listing(boolean) to authenticated;

revoke all on function public.member_start_team_takeover(uuid,numeric,text) from public,anon,service_role;
grant execute on function public.member_start_team_takeover(uuid,numeric,text) to authenticated;

revoke all on function public.member_respond_team_takeover(uuid,text,numeric,text) from public,anon,service_role;
grant execute on function public.member_respond_team_takeover(uuid,text,numeric,text) to authenticated;

revoke all on function public.fia_review_team_takeover(uuid,boolean) from public,anon,service_role;
grant execute on function public.fia_review_team_takeover(uuid,boolean) to authenticated;

commit;