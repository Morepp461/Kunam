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
    ) entries
    order by entries.created_at desc
    limit 30
  ) x;