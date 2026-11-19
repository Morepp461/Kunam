-- Aggregate budget spending server-side to avoid client row limits and exposing raw ledger rows.
create or replace function public.team_owner_get_budget_snapshot(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_team_id uuid;
  v_start date;
  v_end date;
  v_wallet_balance numeric:=0;
  v_outflow numeric:=0;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select m.team_id into v_team_id
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=v_user_id and m.role='Owner';
  if v_team_id is null then raise exception 'Hanya Team Owner yang dapat melihat Budget Guard.'; end if;
  select starts_on,ends_on into v_start,v_end
  from public.license_seasons where id=p_season_id;
  if not found then raise exception 'Season tidak ditemukan.'; end if;
  select coalesce(sum(w.balance),0) into v_wallet_balance
  from public.economy_wallet_accounts w
  where w.team_id=v_team_id and w.account_kind='team' and w.is_active;
  select coalesce(sum(t.amount),0) into v_outflow
  from public.economy_transactions t
  where t.source_account_id in (
    select w.id from public.economy_wallet_accounts w
    where w.team_id=v_team_id and w.account_kind='team' and w.is_active
  )
  and t.created_at>=v_start::timestamptz
  and t.created_at<(v_end+1)::timestamptz;
  return jsonb_build_object(
    'team_id',v_team_id,
    'wallet_balance',v_wallet_balance,
    'season_outflow',v_outflow,
    'season_starts_on',v_start,
    'season_ends_on',v_end
  );
end;
$$;
revoke all on function public.team_owner_get_budget_snapshot(uuid) from public,anon,service_role;
grant execute on function public.team_owner_get_budget_snapshot(uuid) to authenticated;
