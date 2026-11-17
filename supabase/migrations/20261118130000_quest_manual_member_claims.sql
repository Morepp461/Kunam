begin;

-- Stop all scheduled Quest payouts. Completed quests remain unpaid until their
-- owner explicitly invokes member_claim_quest_reward().
do $disable_retry$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job
    where jobname='caleris-quest-wallet-reward-retry'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$disable_retry$;

drop function if exists private.retry_pending_quest_wallet_rewards();

-- The Quest board may update progress and completion, but must not transfer
-- money as a side effect of opening or refreshing the page.
do $manual_board$
declare
  v_source text;
  v_start integer;
  v_end integer;
  v_tail text;
begin
  select p.prosrc into v_source
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='member_get_quest_board'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_source is null then
    raise exception 'member_get_quest_board() tidak ditemukan.';
  end if;

  v_start:=position(
    '      if v_assignment.reward_status<>' || quote_literal('paid') || ' then'
    in v_source
  );
  if v_start=0 then
    raise exception 'Blok payout otomatis Quest tidak ditemukan. Migration dihentikan.';
  end if;

  v_tail:=substring(v_source from v_start);
  v_end:=position(
    E'\nelse\n      update public.caleris_quest_assignments'
    in v_tail
  );
  if v_end=0 then
    raise exception 'Batas blok payout Quest tidak cocok. Migration dihentikan.';
  end if;

  v_source:=
    substring(v_source from 1 for v_start-1)
    || E'      -- Progress is recorded here; reward payment requires an explicit member claim.\n'
    || substring(v_tail from v_end);

  execute
    'create or replace function public.member_get_quest_board() returns jsonb '
    || 'language plpgsql security definer set search_path to '''' as $function$'
    || v_source || '$function$';
end;
$manual_board$;

revoke all on function public.member_get_quest_board() from public,anon,service_role;
grant execute on function public.member_get_quest_board() to authenticated;

-- A completed Quest can only be paid by its authenticated owner. The target
-- is the member's personal role wallet, never a Team Wallet or reward wallet.
create or replace function public.member_claim_quest_reward(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_assignment public.caleris_quest_assignments%rowtype;
  v_title text;
  v_quest_key text;
  v_role_scope text;
  v_difficulty text;
  v_wallet_id uuid;
  v_bank_id uuid;
  v_tx jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  select a.* into v_assignment
  from public.caleris_quest_assignments a
  join public.profiles p on p.member_id=a.member_id
  where a.id=p_assignment_id and p.user_id=v_user
  for update of a;

  if not found then
    raise exception 'Quest tidak ditemukan atau bukan milik akun ini.';
  end if;

  if v_assignment.status<>'completed' then
    raise exception 'Reward hanya dapat diklaim setelah target Quest tercapai.';
  end if;

  if v_assignment.reward_status='paid' then
    return jsonb_build_object('status','paid','already_claimed',true);
  end if;

  select c.title,c.quest_key,c.role_scope,c.difficulty
  into v_title,v_quest_key,v_role_scope,v_difficulty
  from public.caleris_quest_catalog c
  where c.id=v_assignment.quest_id;

  if v_role_scope='driver' then
    select w.id into v_wallet_id
    from public.economy_wallet_accounts w
    where w.account_kind='driver'
      and w.member_id=v_assignment.member_id
      and w.is_active;
  elsif v_role_scope='team_owner' then
    select w.id into v_wallet_id
    from public.economy_wallet_accounts w
    where w.account_kind='team_owner'
      and w.member_id=v_assignment.member_id
      and w.is_active;
  else
    raise exception 'Role penerima reward tidak valid.';
  end if;

  if v_wallet_id is null then
    raise exception 'Wallet pribadi untuk role karakter tidak tersedia.';
  end if;

  select w.id into v_bank_id
  from public.economy_wallet_accounts w
  where w.account_kind='vreeo_bank' and w.is_active
  order by w.created_at
  limit 1;

  if v_bank_id is null then
    update public.caleris_quest_assignments
    set reward_status='pending'
    where id=v_assignment.id and reward_status<>'paid';
    return jsonb_build_object('status','pending','reason','VreeoBank tidak tersedia. Coba klaim kembali nanti.');
  end if;

  v_tx:=private.post_economy_transaction(
    v_bank_id,
    v_wallet_id,
    v_assignment.reward_amount,
    'bank_reward',
    'Quest reward: '||v_title,
    'quest-reward:'||v_assignment.id::text,
    v_user,
    jsonb_build_object(
      'quest_assignment_id',v_assignment.id,
      'quest_key',v_quest_key,
      'role_scope',v_role_scope,
      'difficulty',v_difficulty,
      'source','quest_engine'
    ),
    null,
    true
  );

  if v_tx is null then
    update public.caleris_quest_assignments
    set reward_status='pending'
    where id=v_assignment.id and reward_status<>'paid';
    return jsonb_build_object('status','pending','reason','Saldo VreeoBank belum mencukupi. Coba klaim kembali nanti.');
  end if;

  update public.caleris_quest_assignments
  set reward_status='paid',
      reward_transaction_id=(v_tx->>'transaction_id')::uuid,
      paid_at=coalesce(paid_at,now())
  where id=v_assignment.id;

  return jsonb_build_object(
    'status','paid',
    'transaction_id',(v_tx->>'transaction_id')::uuid,
    'amount',v_assignment.reward_amount,
    'destination_wallet',v_role_scope
  );
end;
$function$;

revoke all on function public.member_claim_quest_reward(uuid) from public,anon,service_role;
grant execute on function public.member_claim_quest_reward(uuid) to authenticated;

-- Disable the legacy Admin payout endpoint. Admins configure reward amounts;
-- only the member who completed a Quest can claim its reward.
revoke all on function public.admin_process_pending_quest_rewards() from public,anon,authenticated,service_role;

commit;
