begin;

-- Manual lap-record attribution for the initial seed record.
alter table public.caleris_circuits
  add column if not exists initial_lap_record_driver_name text;

-- Preserve the existing record calculation, but expose the holder from the
-- fastest official race-result entry when that time beats the manual seed.
create or replace view public.caleris_circuit_pool as
select
  c.id,
  c.name,
  c.country_code,
  c.total_laps,
  c.avg_track_temp_c,
  c.drs_zones,
  c.straights,
  c.low_speed_corners,
  c.high_speed_corners,
  c.grip_level,
  least(c.initial_lap_record_ms, race_record.fastest_lap_ms) as lap_record_ms,
  c.image_url,
  case
    when race_record.fastest_lap_ms is not null
      and (c.initial_lap_record_ms is null or race_record.fastest_lap_ms < c.initial_lap_record_ms)
      then race_record.driver_name
    else c.initial_lap_record_driver_name
  end as lap_record_driver_name
from public.caleris_circuits c
left join lateral (
  select
    e.fastest_lap_ms,
    m.character_name as driver_name
  from public.license_rounds r
  join public.caleris_race_result_entries e on e.round_id = r.id
  left join public.members m on m.id = e.member_id
  where lower(trim(r.circuit_name)) = lower(trim(c.name))
    and r.circuit_country_code = c.country_code
    and e.fastest_lap_ms is not null
  order by e.fastest_lap_ms asc, e.recorded_at asc, e.id asc
  limit 1
) race_record on true;

-- The quest board only records progress/completion. It must never transfer
-- money as a side effect of viewing or refreshing the page.
do $migration$
declare
  v_source text;
  v_old_block text := $old$if v_assignment.reward_status<>'paid' then
        if v_bank_id is null then
          update public.caleris_quest_assignments set reward_status='pending' where id=v_assignment.id;
        else
          v_tx:=private.post_economy_transaction(
            v_bank_id,v_wallet_id,v_assignment.reward_amount,'bank_reward',
            'Quest reward: '||v_assignment.title,
            'quest-reward:'||v_assignment.id::text,
            v_user,
            jsonb_build_object(
              'quest_assignment_id',v_assignment.id,
              'quest_key',v_assignment.quest_key,
              'role_scope',v_role_scope,
              'difficulty',v_assignment.difficulty,
              'source','quest_engine'
            ),
            null,true
          );
          if v_tx is null then
            update public.caleris_quest_assignments set reward_status='pending' where id=v_assignment.id;
          else
            update public.caleris_quest_assignments
            set reward_status='paid',
                reward_transaction_id=(v_tx->>'transaction_id')::uuid,
                paid_at=coalesce(paid_at,v_now)
            where id=v_assignment.id;
          end if;
        end if;
      end if;$old$;
begin
  select p.prosrc into v_source
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='member_get_quest_board'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_source is null then
    raise exception 'member_get_quest_board() tidak ditemukan.';
  end if;
  if position(v_old_block in v_source)=0 then
    raise exception 'Blok payout otomatis quest tidak cocok dengan versi database. Migration dihentikan agar tidak menimpa perubahan lain.';
  end if;

  v_source:=replace(v_source,v_old_block,E'\n      -- Reward is only paid after an explicit member claim.\n');

  execute
    'create or replace function public.member_get_quest_board() returns jsonb '
    || 'language plpgsql security definer set search_path to '''' as $function$'
    || v_source || '$function$';
end;
$migration$;

-- Existing unpaid/pending assignments came from the old automatic payout
-- path. Reset only unpaid completed rows without a transaction so they also
-- require an explicit claim after this release.
update public.caleris_quest_assignments
set reward_status='unpaid'
where status='completed'
  and reward_status='pending'
  and reward_transaction_id is null;

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
    raise exception 'Reward hanya dapat diklaim setelah target quest tercapai.';
  end if;
  if v_assignment.reward_status='paid' then
    return jsonb_build_object('status','paid','already_claimed',true);
  end if;

  select c.title,c.role_scope,c.difficulty
  into v_title,v_role_scope,v_difficulty
  from public.caleris_quest_catalog c
  where c.id=v_assignment.quest_id;

  if v_role_scope='driver' then
    select w.id into v_wallet_id
    from public.economy_wallet_accounts w
    where w.account_kind='driver' and w.member_id=v_assignment.member_id and w.is_active
  elsif v_role_scope='team_owner' then
    select w.id into v_wallet_id
    from public.economy_wallet_accounts w
    where w.account_kind='team_owner' and w.member_id=v_assignment.member_id and w.is_active
  else
    raise exception 'Role penerima reward tidak valid.'/;
  end if;

  if v_wallet_id is null then
    raise exception 'Wallet penerima reward tidak tersedia.';
  end if;

  select w.id into v_bank_id
  from public.economy_wallet_accounts w
  where w.account_kind='vreeo_bank' and w.is_active

  if v_bank_id is null then
    update public.caleris_quest_assignments
    set reward_status='pending'
    where id=v_assignment.id and reward_status<>'paid';
    return jsonb_build_object('status','pending','reason','VreeoBank tidak tersedia.');
  end if;

  v_tx:=private.post_economy_transaction(
    v_bank_id,v_wallet_id,v_assignment.reward_amount,'bank_reward',
    'Quest reward: '||v_title,
    'quest-reward:'||v_assignment.id::text,
    v_user,
    jsonb_build_object(
      'quest_assignment_id',v_assignment.id,
      'quest_key',(select c.quest_key from public.caleris_quest_catalog c where c.id=v_assignment.quest_id),
      'role_scope',v_role_scope,
      'difficulty',v_difficulty,
      'source','quest_engine'
    ),
    null,true
  );

  if v_tx is null then
    update public.caleris_quest_assignments
    set reward_status='pending'
    where id=v_assignment.id and reward_status<>'paid';
    return jsonb_build_object('status','pending','reason','Saldo VreeoBank belum mencukupi.');
  end if;

  update public.caleris_quest_assignments
  set reward_status='paid',
      reward_transaction_id=(v_tx->>'transaction_id')::uuid,
      paid_at=coalesce(paid_at,now())
  where id=v_assignment.id;

  return jsonb_build_object(
    'status','paid',
    'transaction_id',(v_tx->>'transaction_id')::uuid,
    'amount',v_assignment.reward_amount
  );
end;
$function$;

revoke all on function public.member_claim_quest_reward(uuid) from public,anon,service_role;
grant execute on function public.member_claim_quest_reward(uuid) to authenticated;

commit;
