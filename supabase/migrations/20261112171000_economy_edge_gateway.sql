-- Restrict economy mutation RPCs to the trusted Edge Function service role.
-- The Edge Function validates the caller's JWT and site_admins membership before forwarding actor id.

drop function if exists public.admin_post_economy_transaction(uuid,uuid,numeric,text,text,text,jsonb);
drop function if exists public.admin_reverse_economy_transaction(uuid);
drop function if exists public.admin_process_pending_economy_rewards();

create function public.admin_post_economy_transaction(
  p_actor_id uuid,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_event_type text,
  p_description text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_actor_id is null or not exists(
    select 1 from public.site_admins a where a.user_id=p_actor_id
  ) then
    raise exception 'Hanya Admin yang dapat mencatat transaksi ekonomi.';
  end if;
  if p_event_type='reversal' then
    raise exception 'Gunakan fungsi pembatalan transaksi khusus.';
  end if;
  return private.post_economy_transaction(
    p_source_account_id,p_destination_account_id,p_amount,p_event_type,p_description,
    p_idempotency_key,p_actor_id,coalesce(p_metadata,'{}'::jsonb),null,false
  );
end;
$$;

create function public.admin_reverse_economy_transaction(
  p_transaction_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_original public.economy_transactions%rowtype;
  v_result jsonb;
begin
  if p_actor_id is null or not exists(
    select 1 from public.site_admins a where a.user_id=p_actor_id
  ) then
    raise exception 'Hanya Admin yang dapat membatalkan transaksi ekonomi.';
  end if;
  select * into v_original from public.economy_transactions
  where id=p_transaction_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan.'; end if;
  if v_original.event_type='reversal' then raise exception 'Transaksi reversal tidak dapat dibatalkan.'; end if;
  if exists(select 1 from public.economy_transactions where reversal_of=v_original.id) then
    raise exception 'Transaksi ini sudah dibatalkan.';
  end if;
  v_result:=private.post_economy_transaction(
    v_original.destination_account_id,v_original.source_account_id,v_original.amount,
    'reversal','Pembatalan transaksi: '||v_original.description,
    'reversal:'||v_original.id::text,p_actor_id,
    jsonb_build_object('original_transaction_id',v_original.id,'original_event_type',v_original.event_type),
    v_original.id,false
  );
  update public.economy_reward_claims
  set status='reversed'
  where transaction_id=v_original.id and status='paid';
  return v_result;
end;
$$;

create function public.admin_process_pending_economy_rewards(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claim public.economy_reward_claims%rowtype;
  v_bank_id uuid;
  v_driver_wallet_id uuid;
  v_result jsonb;
  v_paid integer:=0;
  v_pending integer:=0;
begin
  if p_actor_id is null or not exists(
    select 1 from public.site_admins a where a.user_id=p_actor_id
  ) then
    raise exception 'Hanya Admin yang dapat memproses reward tertunda.';
  end if;
  select id into v_bank_id from public.economy_wallet_accounts where account_kind='vreeo_bank';
  for v_claim in
    select * from public.economy_reward_claims where status='pending'
    order by created_at,id for update skip locked
  loop
    select id into v_driver_wallet_id from public.economy_wallet_accounts
    where account_kind='driver' and member_id=v_claim.member_id and is_active;
    if v_driver_wallet_id is null then
      v_pending:=v_pending+1;
      continue;
    end if;
    v_result:=private.post_economy_transaction(
      v_bank_id,v_driver_wallet_id,v_claim.amount,'checkin_reward',
      'Daily check-in reward','checkin-reward:'||v_claim.source_id::text,
      p_actor_id,jsonb_build_object('checkin_id',v_claim.source_id,'claim_id',v_claim.id),
      null,true
    );
    if v_result is null then
      v_pending:=v_pending+1;
      exit;
    end if;
    update public.economy_reward_claims
    set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now()
    where id=v_claim.id;
    v_paid:=v_paid+1;
  end loop;
  return jsonb_build_object('paid',v_paid,'pending',v_pending);
end;
$$;

revoke all on function public.admin_post_economy_transaction(uuid,uuid,uuid,numeric,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.admin_reverse_economy_transaction(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_process_pending_economy_rewards(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_post_economy_transaction(uuid,uuid,uuid,numeric,text,text,text,jsonb) to service_role;
grant execute on function public.admin_reverse_economy_transaction(uuid,uuid) to service_role;
grant execute on function public.admin_process_pending_economy_rewards(uuid) to service_role;
