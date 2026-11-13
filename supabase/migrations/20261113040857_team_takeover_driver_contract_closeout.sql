begin;
create or replace function public.fia_review_team_takeover(p_takeover_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_take public.caleris_team_takeovers%rowtype; v_buyer public.members%rowtype;
  v_seller public.members%rowtype; v_team public.teams%rowtype;
  v_reviewer_member_id uuid; v_buyer_wallet_id uuid; v_seller_wallet_id uuid; v_transaction jsonb;
begin
  if not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat meninjau Take Over.'; end if;
  select * into v_take from public.caleris_team_takeovers where id=p_takeover_id for update;
  if not found or v_take.status<>'pending_fia' then raise exception 'Take Over belum siap ditinjau FIA.'; end if;
  select member_id into v_reviewer_member_id from public.profiles where user_id=(select auth.uid());
  if v_reviewer_member_id in (v_take.buyer_member_id,v_take.seller_member_id)
    and not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then
    raise exception 'Pihak yang terlibat tidak dapat meninjau Take Over sendiri.';
  end if;
  if not p_approve then
    update public.caleris_team_takeovers set status='rejected',updated_at=now() where id=v_take.id;
    return jsonb_build_object('status','rejected');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_take.buyer_member_id::text,1));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_take.target_team_id::text,0));
  select * into v_team from public.teams where id=v_take.target_team_id for update;
  perform 1 from public.members where id in (v_take.buyer_member_id,v_take.seller_member_id) order by id for update;
  select * into v_buyer from public.members where id=v_take.buyer_member_id;
  select * into v_seller from public.members where id=v_take.seller_member_id;
  if v_team.id is null or v_buyer.id is null or v_seller.id is null then raise exception 'Data tim atau member Take Over tidak lengkap.'; end if;
  if (v_buyer.role is not null and v_buyer.role not in ('Driver','FIA'))
    or v_seller.role is distinct from 'Owner'
    or v_seller.team_id is distinct from v_take.target_team_id then
    raise exception 'Status pembeli atau kepemilikan tim sudah berubah. Take Over tidak dapat diselesaikan.';
  end if;
  if v_take.agreed_amount is null or v_take.agreed_amount<=0 then raise exception 'Harga kesepakatan Take Over tidak valid.'; end if;
  if v_buyer.role='Driver' then
    select id into v_buyer_wallet_id from public.economy_wallet_accounts where member_id=v_buyer.id and account_kind='driver' and is_active;
  else
    select wa.id into v_buyer_wallet_id from public.profiles p
    join public.economy_wallet_accounts wa on wa.profile_user_id=p.user_id and wa.account_kind='public_member' and wa.is_active
    where p.member_id=v_buyer.id;
  end if;
  select id into v_seller_wallet_id from public.economy_wallet_accounts where member_id=v_seller.id and account_kind='team_owner' and is_active;
  if v_buyer_wallet_id is null or v_seller_wallet_id is null then raise exception 'Personal wallet pembeli atau Team Owner wallet penjual tidak ditemukan.'; end if;
  v_transaction:=private.post_economy_transaction(
    v_buyer_wallet_id,v_seller_wallet_id,v_take.agreed_amount,'transfer',
    'Team Take Over payment · '||v_team.name,'team-takeover:'||v_take.id::text,
    (select auth.uid()),
    jsonb_build_object('takeover_id',v_take.id,'team_id',v_team.id,'buyer_member_id',v_buyer.id,'seller_member_id',v_seller.id,'valuation_id',v_take.valuation_id),
    null,false
  );
  -- Existing pending payroll claims remain payable; only future Driver contracts end.
  if v_buyer.role='Driver' then
    update public.economy_driver_contracts
    set status='ended',updated_by=(select auth.uid()),updated_at=now()
    where member_id=v_buyer.id and status='active';
  end if;
  update public.members set role=null,team_id=null where id=v_seller.id;
  update public.members set role='Owner',team_id=v_team.id where id=v_buyer.id;
  update public.teams set takeover_listed=false where id=v_team.id;
  update public.caleris_team_takeovers
  set status='completed',transaction_id=(v_transaction->>'transaction_id')::uuid,settled_at=now(),updated_at=now()
  where id=v_take.id;
  update public.caleris_team_takeovers set status='cancelled',updated_at=now()
  where buyer_member_id=v_buyer.id and id<>v_take.id
    and status in ('offered','negotiating','seller_accepted','pending_fia','approved');
  return jsonb_build_object('status','completed','takeover_id',v_take.id,
    'transaction_id',v_transaction->>'transaction_id','buyer_member_id',v_buyer.id,
    'seller_member_id',v_seller.id,'team_id',v_team.id,'agreed_amount',v_take.agreed_amount);
end;
$$;
commit;