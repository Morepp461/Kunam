begin;

-- Dedicated internal clearing wallet keeps Admin profile adjustments double-entry
-- without changing VreeoBank, Sponsor Source, or any player/team wallet directly.
alter table public.economy_wallet_accounts
  drop constraint if exists economy_wallet_accounts_account_kind_check;
alter table public.economy_wallet_accounts
  add constraint economy_wallet_accounts_account_kind_check
  check (account_kind = any (array[
    'public_member','driver','team_owner','team','vreeo_bank','sponsor_source',
    'development_shop','merchandise_market','merchandise_supplier','admin_adjustment_clearing'
  ]::text[]));

alter table public.economy_wallet_accounts
  drop constraint if exists economy_wallet_owner_shape;
alter table public.economy_wallet_accounts
  add constraint economy_wallet_owner_shape
  check (
    ((account_kind='public_member') and profile_user_id is not null and member_id is null and team_id is null)
    or ((account_kind in ('driver','team_owner')) and profile_user_id is null and member_id is not null and team_id is null)
    or ((account_kind='team') and profile_user_id is null and member_id is null and team_id is not null)
    or ((account_kind in ('vreeo_bank','sponsor_source','development_shop','merchandise_market','merchandise_supplier','admin_adjustment_clearing'))
        and profile_user_id is null and member_id is null and team_id is null)
  );

create unique index if not exists economy_wallet_admin_adjustment_clearing_unique
  on public.economy_wallet_accounts(account_kind)
  where account_kind='admin_adjustment_clearing';

insert into public.economy_wallet_accounts(account_kind,balance,is_active)
select 'admin_adjustment_clearing',0,true
where not exists(
  select 1 from public.economy_wallet_accounts where account_kind='admin_adjustment_clearing'
);

-- Hide the internal balancing account from the general wallet directory.
create or replace view public.economy_wallet_directory as
select
  w.id,w.account_kind,w.profile_user_id,w.member_id,w.team_id,w.balance,w.is_active,w.created_at,w.updated_at,
  case
    when w.account_kind='vreeo_bank' then 'VreeoBank'
    when w.account_kind='sponsor_source' then 'Sponsor Source'
    when w.account_kind='team' then coalesce(t.name,'Team')
    when w.account_kind='public_member' then coalesce(p.web_nickname,p.first_name,p.public_member_id,'Public Member')
    when w.account_kind='driver' then coalesce(m.character_name,p.driver_nickname,p.web_nickname,'Driver')
    when w.account_kind='team_owner' then coalesce(m.character_name,p.web_nickname,'Team Owner')
    else 'Wallet'
  end as display_name
from public.economy_wallet_accounts w
left join public.profiles p on p.user_id=w.profile_user_id or (w.member_id is not null and p.member_id=w.member_id)
left join public.members m on m.id=w.member_id
left join public.teams t on t.id=w.team_id
where w.account_kind<>'admin_adjustment_clearing';

-- Extend the existing double-entry transaction service with the internal clearing
-- account. Existing Admin wallet injection behavior remains backward compatible.
do $patch_post$
declare
  v_source text;
  v_before text;
begin
  select pg_get_functiondef(
    'private.post_economy_transaction(uuid,uuid,numeric,text,text,text,uuid,jsonb,uuid,boolean)'::regprocedure
  ) into v_source;
  v_before:=v_source;

  v_source:=replace(
    v_source,
    $old$elsif p_event_type='admin_adjustment' and (v_source.account_kind='sponsor_source' or v_destination.account_kind='sponsor_source') then
  raise exception 'Rute penyesuaian tidak valid.';$old$,
    $new$elsif p_event_type='admin_adjustment' and not (
  (v_source.account_kind='admin_adjustment_clearing' and v_destination.account_kind in ('driver','team_owner','team'))
  or (v_destination.account_kind='admin_adjustment_clearing' and v_source.account_kind in ('driver','team_owner','team'))
  or (v_source.account_kind='vreeo_bank' and v_destination.account_kind in ('driver','team_owner','team'))
 ) then
  raise exception 'Rute penyesuaian tidak valid.';$new$
  );
  v_source:=replace(
    v_source,
    $old$if v_source.balance<p_amount and v_source.account_kind<>'sponsor_source' and not (p_event_type='sponsor_payout' and v_source.account_kind='vreeo_bank') and p_event_type not in ('tax','fine') then$old$,
    $new$if v_source.balance<p_amount and v_source.account_kind not in ('sponsor_source','admin_adjustment_clearing') and not (p_event_type='sponsor_payout' and v_source.account_kind='vreeo_bank') and p_event_type not in ('tax','fine') then$new$
  );

  if v_source=v_before
     or position('admin_adjustment_clearing' in v_source)=0 then
    raise exception 'Transaction engine source changed; refusing unsafe Admin clearing patch.';
  end if;
  execute v_source;
end;
$patch_post$;

create or replace function public.caleris_admin_get_profile_adjustment_snapshot(
  p_member_id uuid,
  p_team_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_name text;
  v_kind text;
  v_wallet_id uuid;
  v_balance numeric;
  v_total_xp numeric:=0;
  v_level integer:=0;
begin
  if (select auth.uid()) is null
     or not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'not_authorized';
  end if;
  if (p_member_id is null)=(p_team_id is null) then
    raise exception 'exactly_one_profile_target_required';
  end if;

  if p_member_id is not null then
    select m.role,m.character_name into v_role,v_name
    from public.members m where m.id=p_member_id;
    if not found or v_role not in ('Driver','Owner') then
      raise exception 'unsupported_member_profile_target';
    end if;
    v_kind:=case when v_role='Driver' then 'driver' else 'team_owner' end;
    select d.id,d.balance,d.display_name into v_wallet_id,v_balance,v_name
    from public.economy_wallet_directory d
    where d.account_kind=v_kind and d.member_id=p_member_id and d.is_active;
    if v_wallet_id is null then raise exception 'target_wallet_not_found'; end if;
    select coalesce(sum(l.amount),0) into v_total_xp
    from public.caleris_xp_ledger l where l.member_id=p_member_id;
    v_level:=public.caleris_xp_level(v_total_xp);
    return jsonb_build_object(
      'target_type','member','member_id',p_member_id,'team_id',null,
      'display_name',coalesce(v_name,'Member'),'role',v_role,
      'xp_total',v_total_xp,'level',v_level,
      'wallet_id',v_wallet_id,'wallet_kind',v_kind,'wallet_balance',v_balance
    );
  end if;

  select t.name into v_name from public.teams t where t.id=p_team_id;
  if not found then raise exception 'team_profile_not_found'; end if;
  select d.id,d.balance into v_wallet_id,v_balance
  from public.economy_wallet_directory d
  where d.account_kind='team' and d.team_id=p_team_id and d.is_active;
  if v_wallet_id is null then raise exception 'target_wallet_not_found'; end if;
  return jsonb_build_object(
    'target_type','team','member_id',null,'team_id',p_team_id,
    'display_name',coalesce(v_name,'Team'),'role','Team',
    'xp_total',null,'level',null,
    'wallet_id',v_wallet_id,'wallet_kind','team','wallet_balance',v_balance
  );
end;
$function$;

create or replace function public.caleris_admin_adjust_profile_wallet(
  p_wallet_account_id uuid,
  p_operation text,
  p_amount numeric,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=(select auth.uid());
  v_target public.economy_wallet_accounts%rowtype;
  v_clearing_id uuid;
  v_source uuid;
  v_destination uuid;
  v_result jsonb;
  v_delta numeric;
begin
  if v_actor is null or not exists(select 1 from public.site_admins a where a.user_id=v_actor) then
    raise exception 'not_authorized';
  end if;
  if p_operation not in ('add','subtract') or p_amount is null or p_amount<=0
     or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'invalid_wallet_adjustment';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 240 then
    raise exception 'adjustment_reason_required';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 8 and 180 then
    raise exception 'invalid_idempotency_key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  select * into v_target from public.economy_wallet_accounts
  where id=p_wallet_account_id and is_active for update;
  if not found or v_target.account_kind not in ('driver','team_owner','team') then
    raise exception 'unsupported_wallet_target';
  end if;
  select id into v_clearing_id from public.economy_wallet_accounts
  where account_kind='admin_adjustment_clearing' and is_active for update;
  if v_clearing_id is null then raise exception 'adjustment_clearing_wallet_missing'; end if;

  if p_operation='add' then
    v_source:=v_clearing_id;
    v_destination:=p_wallet_account_id;
    v_delta:=p_amount;
  else
    v_source:=p_wallet_account_id;
    v_destination:=v_clearing_id;
    v_delta:=-p_amount;
  end if;

  v_result:=private.post_economy_transaction(
    v_source,v_destination,p_amount,'admin_adjustment',
    'Admin profile wallet adjustment · '||btrim(p_reason),
    btrim(p_idempotency_key),v_actor,
    jsonb_build_object(
      'purpose','admin_profile_wallet_adjustment','actor_id',v_actor,
      'target_wallet_id',p_wallet_account_id,'target_kind',v_target.account_kind,
      'member_id',v_target.member_id,'team_id',v_target.team_id,
      'operation',p_operation,'signed_amount',v_delta,'reason',btrim(p_reason)
    ),
    null,false
  );
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'wallet_id',p_wallet_account_id,'operation',p_operation,'signed_amount',v_delta
  );
end;
$function$;

create or replace function public.caleris_admin_adjust_xp(
  p_member_id uuid,
  p_amount integer,
  p_source_id text,
  p_description text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=(select auth.uid());
  v_current numeric;
  v_existing public.caleris_xp_ledger%rowtype;
  v_inserted integer;
  v_next numeric;
begin
  if v_actor is null or not exists(select 1 from public.site_admins a where a.user_id=v_actor) then
    raise exception 'not_authorized';
  end if;
  if p_member_id is null or p_amount is null or p_amount=0 or abs(p_amount)>100000
     or nullif(btrim(p_source_id),'') is null
     or nullif(btrim(p_description),'') is null then
    raise exception 'invalid_xp_adjustment';
  end if;

  perform 1 from public.members where id=p_member_id for update;
  if not found then raise exception 'member_not_found'; end if;
  select * into v_existing from public.caleris_xp_ledger
  where member_id=p_member_id and source_type='admin_adjustment' and source_id=btrim(p_source_id)
  for update;
  if found then
    if v_existing.amount<>p_amount or v_existing.metadata->>'reason' is distinct from left(btrim(p_description),240) then
      raise exception 'idempotency_key_conflict';
    end if;
    select coalesce(sum(amount),0) into v_current from public.caleris_xp_ledger where member_id=p_member_id;
    return jsonb_build_object('member_id',p_member_id,'total_xp',v_current,'level',public.caleris_xp_level(v_current),'inserted',false);
  end if;

  select coalesce(sum(amount),0) into v_current
  from public.caleris_xp_ledger where member_id=p_member_id;
  v_next:=v_current+p_amount;
  if v_next<0 then raise exception 'xp_total_cannot_be_negative'; end if;

  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description,metadata)
  values(
    p_member_id,p_amount,'admin_adjustment',btrim(p_source_id),left(btrim(p_description),240),
    jsonb_build_object(
      'actor_id',v_actor,'target_member_id',p_member_id,
      'adjustment_type',case when p_amount>0 then 'add' else 'subtract' end,
      'amount',p_amount,'before_xp',v_current,'after_xp',v_next,
      'reason',left(btrim(p_description),240)
    )
  );
  get diagnostics v_inserted=row_count;
  if v_inserted=1 then
    perform public.caleris_log_activity(
      p_member_id,null,'xp_adjustment','Penyesuaian XP',
      'XP akun diperbarui oleh administrasi CALERIS.',
      jsonb_build_object('source_id',btrim(p_source_id),'amount',p_amount)
    );
  end if;
  select coalesce(sum(amount),0) into v_current
  from public.caleris_xp_ledger where member_id=p_member_id;
  return jsonb_build_object('member_id',p_member_id,'total_xp',v_current,'level',public.caleris_xp_level(v_current),'inserted',v_inserted=1);
end;
$function$;

create or replace function public.caleris_admin_get_profile_adjustment_history(
  p_member_id uuid,
  p_team_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_wallet_id uuid;
  v_history jsonb;
begin
  if (select auth.uid()) is null
     or not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'not_authorized';
  end if;
  if (p_member_id is null)=(p_team_id is null) then
    raise exception 'exactly_one_profile_target_required';
  end if;

  if p_member_id is not null then
    select d.id into v_wallet_id
    from public.economy_wallet_directory d
    where d.account_kind in ('driver','team_owner') and d.member_id=p_member_id and d.is_active;
    if v_wallet_id is null then raise exception 'target_wallet_not_found'; end if;
  else
    select d.id into v_wallet_id
    from public.economy_wallet_directory d
    where d.account_kind='team' and d.team_id=p_team_id and d.is_active;
    if v_wallet_id is null then raise exception 'target_wallet_not_found'; end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_history
  from (
    select 'xp'::text as kind,l.amount as signed_amount,l.description,l.created_at,l.metadata,l.source_id as reference
    from public.caleris_xp_ledger l
    where p_member_id is not null and l.member_id=p_member_id and l.source_type='admin_adjustment'
    union all
    select 'wallet'::text as kind,
      case when t.destination_account_id=v_wallet_id then t.amount else -t.amount end as signed_amount,
      t.description,t.created_at,t.metadata,t.idempotency_key as reference
    from public.economy_transactions t
    where t.event_type='admin_adjustment'
      and (t.source_account_id=v_wallet_id or t.destination_account_id=v_wallet_id)
  ) x
  order by x.created_at desc
  limit 30;
  return v_history;
end;
$function$;

revoke all on function public.caleris_admin_get_profile_adjustment_snapshot(uuid,uuid) from public,anon,service_role;
revoke all on function public.caleris_admin_adjust_profile_wallet(uuid,text,numeric,text,text) from public,anon,service_role;
revoke all on function public.caleris_admin_adjust_xp(uuid,integer,text,text) from public,anon,service_role;
revoke all on function public.caleris_admin_get_profile_adjustment_history(uuid,uuid) from public,anon,service_role;
grant execute on function public.caleris_admin_get_profile_adjustment_snapshot(uuid,uuid) to authenticated;
grant execute on function public.caleris_admin_adjust_profile_wallet(uuid,text,numeric,text,text) to authenticated;
grant execute on function public.caleris_admin_adjust_xp(uuid,integer,text,text) to authenticated;
grant execute on function public.caleris_admin_get_profile_adjustment_history(uuid,uuid) to authenticated;

commit;
