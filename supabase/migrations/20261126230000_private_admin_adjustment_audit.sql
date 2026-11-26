begin;

create table if not exists private.caleris_admin_xp_adjustment_audit (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  actor_id uuid not null,
  source_id text not null,
  amount integer not null check (amount<>0),
  before_xp numeric not null,
  after_xp numeric not null check (after_xp>=0),
  reason text not null,
  created_at timestamptz not null default now(),
  unique(member_id,source_id)
);

create table if not exists private.caleris_admin_wallet_adjustment_audit (
  id uuid primary key default gen_random_uuid(),
  wallet_account_id uuid not null references public.economy_wallet_accounts(id) on delete restrict,
  member_id uuid,
  team_id uuid,
  actor_id uuid not null,
  idempotency_key text not null unique,
  operation text not null check (operation in ('add','subtract')),
  amount numeric not null check (amount>0),
  before_balance numeric not null,
  after_balance numeric not null check (after_balance>=0),
  reason text not null,
  created_at timestamptz not null default now()
);

revoke all on private.caleris_admin_xp_adjustment_audit from public,anon,authenticated,service_role;
revoke all on private.caleris_admin_wallet_adjustment_audit from public,anon,authenticated,service_role;

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
  v_existing private.caleris_admin_xp_adjustment_audit%rowtype;
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

  select * into v_existing from private.caleris_admin_xp_adjustment_audit
  where member_id=p_member_id and source_id=btrim(p_source_id)
  for update;
  if found then
    if v_existing.amount<>p_amount or v_existing.reason is distinct from left(btrim(p_description),240) then
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
    p_member_id,p_amount,'admin_adjustment',btrim(p_source_id),
    'XP balance adjustment by CALERIS administration',
    jsonb_build_object('adjustment_type',case when p_amount>0 then 'add' else 'subtract' end,'amount',p_amount)
  );

  insert into private.caleris_admin_xp_adjustment_audit(
    member_id,actor_id,source_id,amount,before_xp,after_xp,reason
  ) values(
    p_member_id,v_actor,btrim(p_source_id),p_amount,v_current,v_next,left(btrim(p_description),240)
  );

  perform public.caleris_log_activity(
    p_member_id,null,'xp_adjustment','Penyesuaian XP',
    'XP akun diperbarui oleh administrasi CALERIS.',
    jsonb_build_object('source_id',btrim(p_source_id),'amount',p_amount)
  );
  select coalesce(sum(amount),0) into v_current
  from public.caleris_xp_ledger where member_id=p_member_id;
  return jsonb_build_object('member_id',p_member_id,'total_xp',v_current,'level',public.caleris_xp_level(v_current),'inserted',true);
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
  v_before numeric;
  v_after numeric;
  v_existing private.caleris_admin_wallet_adjustment_audit%rowtype;
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
  select * into v_existing from private.caleris_admin_wallet_adjustment_audit
  where idempotency_key=btrim(p_idempotency_key) for update;
  if found then
    if v_existing.wallet_account_id<>p_wallet_account_id
       or v_existing.operation<>p_operation
       or v_existing.amount<>p_amount
       or v_existing.reason is distinct from left(btrim(p_reason),240) then
      raise exception 'idempotency_key_conflict';
    end if;
    return jsonb_build_object(
      'wallet_id',v_existing.wallet_account_id,'operation',v_existing.operation,
      'signed_amount',case when v_existing.operation='add' then v_existing.amount else -v_existing.amount end,
      'before_balance',v_existing.before_balance,'after_balance',v_existing.after_balance,'inserted',false
    );
  end if;

  select * into v_target from public.economy_wallet_accounts
  where id=p_wallet_account_id and is_active for update;
  if not found or v_target.account_kind not in ('driver','team_owner','team') then
    raise exception 'unsupported_wallet_target';
  end if;
  v_before:=v_target.balance;

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
    'Admin profile wallet adjustment',
    btrim(p_idempotency_key),null,
    jsonb_build_object(
      'purpose','admin_profile_wallet_adjustment',
      'operation',p_operation,
      'signed_amount',v_delta
    ),
    null,false
  );

  select balance into v_after from public.economy_wallet_accounts where id=p_wallet_account_id;
  insert into private.caleris_admin_wallet_adjustment_audit(
    wallet_account_id,member_id,team_id,actor_id,idempotency_key,operation,amount,
    before_balance,after_balance,reason
  ) values(
    p_wallet_account_id,v_target.member_id,v_target.team_id,v_actor,btrim(p_idempotency_key),
    p_operation,p_amount,v_before,v_after,left(btrim(p_reason),240)
  );

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'wallet_id',p_wallet_account_id,'operation',p_operation,'signed_amount',v_delta,
    'before_balance',v_before,'after_balance',v_after,'inserted',true
  );
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
    select * from (
      select 'xp'::text as kind,a.amount as signed_amount,
        a.reason as description,a.created_at,
        jsonb_build_object('actor_id',a.actor_id,'before_xp',a.before_xp,'after_xp',a.after_xp) as metadata,
        a.source_id as reference
      from private.caleris_admin_xp_adjustment_audit a
      where p_member_id is not null and a.member_id=p_member_id
      union all
      select 'wallet'::text as kind,
        case when a.operation='add' then a.amount else -a.amount end as signed_amount,
        a.reason as description,a.created_at,
        jsonb_build_object('actor_id',a.actor_id,'before_balance',a.before_balance,'after_balance',a.after_balance) as metadata,
        a.idempotency_key as reference
      from private.caleris_admin_wallet_adjustment_audit a
      where a.wallet_account_id=v_wallet_id
    ) entries
    order by entries.created_at desc
    limit 30
  ) x;
  return v_history;
end;
$function$;

revoke all on function public.caleris_admin_adjust_xp(uuid,integer,text,text) from public,anon,service_role;
revoke all on function public.caleris_admin_adjust_profile_wallet(uuid,text,numeric,text,text) from public,anon,service_role;
revoke all on function public.caleris_admin_get_profile_adjustment_history(uuid,uuid) from public,anon,service_role;
grant execute on function public.caleris_admin_adjust_xp(uuid,integer,text,text) to authenticated;
grant execute on function public.caleris_admin_adjust_profile_wallet(uuid,text,numeric,text,text) to authenticated;
grant execute on function public.caleris_admin_get_profile_adjustment_history(uuid,uuid) to authenticated;

commit;
