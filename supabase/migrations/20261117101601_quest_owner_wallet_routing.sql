begin;

create or replace function public.member_get_quest_board()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=(select auth.uid());
  v_member public.members%rowtype;
  v_role_scope text;
  v_day date;
  v_now timestamptz:=clock_timestamp();
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_season_id uuid;
  v_period public.season_calendar_periods%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_wallet_id uuid;
  v_wallet_balance numeric:=0;
  v_bank_id uuid;
  v_assignment record;
  v_progress numeric;
  v_tx jsonb;
  v_daily jsonb;
  v_period_quests jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select m.* into v_member
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=v_user;
  if not found then raise exception 'Akun belum terhubung ke karakter member.'; end if;

  if v_member.role='Driver' then
    v_role_scope:='driver';
    select id,balance into v_wallet_id,v_wallet_balance
    from public.economy_wallet_accounts
    where account_kind='driver' and member_id=v_member.id and is_active;
  elsif v_member.role='Owner' and v_member.team_id is not null then
    v_role_scope:='team_owner';
    select id,balance into v_wallet_id,v_wallet_balance
    from public.economy_wallet_accounts
    where account_kind='team_owner' and member_id=v_member.id and is_active;
  else
    raise exception 'Quest hanya tersedia untuk Driver dan Team Owner yang memiliki tim.';
  end if;

  if v_wallet_id is null then raise exception 'Wallet reward belum tersedia untuk karakter atau tim ini.'; end if;

  v_day:=(v_now at time zone 'Asia/Jakarta')::date;
  v_day_start:=v_day::timestamp at time zone 'Asia/Jakarta';
  v_day_end:=(v_day+1)::timestamp at time zone 'Asia/Jakarta';

  select id into v_season_id
  from public.license_seasons
  where status='active'
  order by starts_on desc nulls last,created_at desc
  limit 1;

  select p.* into v_period
  from public.season_calendar_periods p
  join public.license_seasons s on s.id=p.season_id
  where v_day between p.starts_on and p.ends_on
    and s.status in ('active','completed')
  order by case when s.status='active' then 0 else 1 end,
    s.starts_on desc nulls last,p.sort_order desc
  limit 1;

  if v_period.id is not null then
    v_season_id:=v_period.season_id;
    v_period_start:=v_period.starts_on::timestamp at time zone 'Asia/Jakarta';
    v_period_end:=(v_period.ends_on+1)::timestamp at time zone 'Asia/Jakarta';
  end if;

  if not exists(
    select 1 from public.caleris_quest_assignments a
    where a.member_id=v_member.id and a.assignment_scope='daily' and a.scope_key=v_day::text
  ) then
    insert into public.caleris_quest_assignments(
      quest_id,member_id,team_id,season_id,assignment_scope,scope_key,
      starts_at,ends_at,reward_amount
    )
    select c.id,v_member.id,v_member.team_id,v_season_id,'daily',v_day::text,
      v_day_start,v_day_end,r.reward_amount
    from public.caleris_quest_catalog c
    join public.caleris_quest_difficulty_rewards r on r.difficulty=c.difficulty
    where c.role_scope=v_role_scope and c.quest_type='daily' and c.is_active
      and (
        c.metric_key<>'race_checkin'
        or exists(
          select 1 from public.license_rounds lr
          where lr.status<>'closed' and v_now between lr.checkin_opens_at and lr.checkin_closes_at
        )
      )
      and (
        c.metric_key<>'team_sponsor_signed'
        or exists(
          select 1 from public.caleris_sponsorship_offers o
          where o.target_kind='team' and o.target_team_id=v_member.team_id and o.status='offered'
        )
      )
      and (
        c.metric_key<>'team_driver_contract'
        or (
          (select count(*) from public.economy_driver_contracts dc
            where dc.team_id=v_member.team_id and dc.status='active')<2
          and exists(select 1 from public.members d where d.role='Driver' and d.team_id is null)
        )
      )
      and (
        c.metric_key<>'team_affiliation'
        or (
          not exists(select 1 from public.caleris_team_affiliations af
            where af.status='accepted' and (af.team_a_id=v_member.team_id or af.team_b_id=v_member.team_id))
          and not exists(select 1 from public.caleris_team_affiliations af
            where af.status='pending' and af.requested_by_team_id=v_member.team_id)
        )
      )
      and (
        c.metric_key<>'driver_development_attribute'
        or exists(select 1 from public.caleris_driver_development_attributes da
          where da.member_id=v_member.id and da.attribute_key=c.metric_filter->>'attribute_key'
            and da.current_value<100)
      )
      and (
        c.metric_key<>'team_development_attribute'
        or exists(select 1 from public.caleris_team_development_parts tp
          where tp.team_id=v_member.team_id and tp.part_key=c.metric_filter->>'attribute_key'
            and tp.current_value<100)
      )
    order by random()
    limit 3
    on conflict(member_id,quest_id,assignment_scope,scope_key) do nothing;
  end if;

  if v_period.id is not null and not exists(
    select 1 from public.caleris_quest_assignments a
    where a.member_id=v_member.id and a.assignment_scope='period' and a.period_id=v_period.id
  ) then
    insert into public.caleris_quest_assignments(
      quest_id,member_id,team_id,season_id,period_id,assignment_scope,scope_key,
      starts_at,ends_at,reward_amount
    )
    select c.id,v_member.id,v_member.team_id,v_period.season_id,v_period.id,'period',v_period.id::text,
      v_period_start,v_period_end,r.reward_amount
    from public.caleris_quest_catalog c
    join public.caleris_quest_difficulty_rewards r on r.difficulty=c.difficulty
    where c.role_scope=v_role_scope and c.quest_type='period' and c.is_active
      and c.period_types @> array[v_period.period_type]::text[]
      and (
        c.metric_key<>'race_checkin'
        or exists(select 1 from public.season_period_rounds pr
          join public.license_rounds lr on lr.id=pr.round_id
          where pr.period_id=v_period.id)
      )
      and (
        c.metric_key<>'team_sponsor_signed'
        or exists(select 1 from public.caleris_sponsorship_offers o
          where o.target_kind='team' and o.target_team_id=v_member.team_id and o.status='offered')
      )
      and (
        c.metric_key<>'team_driver_contract'
        or (
          (select count(*) from public.economy_driver_contracts dc
            where dc.team_id=v_member.team_id and dc.status='active')<2
          and exists(select 1 from public.members d where d.role='Driver' and d.team_id is null)
        )
      )
      and (
        c.metric_key<>'team_affiliation'
        or (
          not exists(select 1 from public.caleris_team_affiliations af
            where af.status='accepted' and (af.team_a_id=v_member.team_id or af.team_b_id=v_member.team_id))
          and not exists(select 1 from public.caleris_team_affiliations af
            where af.status='pending' and af.requested_by_team_id=v_member.team_id)
        )
      )
      and (
        c.metric_key<>'driver_development_attribute'
        or exists(select 1 from public.caleris_driver_development_attributes da
          where da.member_id=v_member.id and da.attribute_key=c.metric_filter->>'attribute_key'
            and da.current_value<100)
      )
      and (
        c.metric_key<>'team_development_attribute'
        or exists(select 1 from public.caleris_team_development_parts tp
          where tp.team_id=v_member.team_id and tp.part_key=c.metric_filter->>'attribute_key'
            and tp.current_value<100)
      )
    order by random()
    limit 5
    on conflict(member_id,quest_id,assignment_scope,scope_key) do nothing;
  end if;

  select id into v_bank_id from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active;

  for v_assignment in
    select a.id,a.starts_at,a.ends_at,a.reward_amount,a.reward_status,a.status,
      c.quest_key,c.title,c.metric_key,c.metric_filter,c.target_value,c.difficulty
    from public.caleris_quest_assignments a
    join public.caleris_quest_catalog c on c.id=a.quest_id
    where a.member_id=v_member.id
      and (
        (a.assignment_scope='daily' and a.scope_key=v_day::text)
        or (a.assignment_scope='period' and a.period_id=v_period.id)
      )
    order by a.assignment_scope,a.created_at,a.id
    for update of a
  loop
    v_progress:=private.caleris_quest_metric_progress(
      v_member.id,v_member.team_id,v_assignment.metric_key,
      v_assignment.starts_at,v_assignment.ends_at,v_assignment.metric_filter
    );

    if v_progress>=v_assignment.target_value then
      update public.caleris_quest_assignments
      set progress=v_progress,status='completed',completed_at=coalesce(completed_at,v_now)
      where id=v_assignment.id;

      if v_assignment.reward_status<>'paid' then
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
      end if;
    else
      update public.caleris_quest_assignments
      set progress=v_progress,
          status=case when v_now>=v_assignment.ends_at then 'expired' else 'active' end
      where id=v_assignment.id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'quest_key',c.quest_key,'title',c.title,'description',c.description,
    'category',c.category,'difficulty',c.difficulty,'target',c.target_value,
    'progress',a.progress,'status',a.status,'reward_amount',a.reward_amount,
    'reward_status',a.reward_status,'completed_at',a.completed_at,'paid_at',a.paid_at
  ) order by c.sort_order,a.created_at),'[]'::jsonb)
  into v_daily
  from public.caleris_quest_assignments a
  join public.caleris_quest_catalog c on c.id=a.quest_id
  where a.member_id=v_member.id and a.assignment_scope='daily' and a.scope_key=v_day::text;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'quest_key',c.quest_key,'title',c.title,'description',c.description,
    'category',c.category,'difficulty',c.difficulty,'target',c.target_value,
    'progress',a.progress,'status',a.status,'reward_amount',a.reward_amount,
    'reward_status',a.reward_status,'completed_at',a.completed_at,'paid_at',a.paid_at
  ) order by c.sort_order,a.created_at),'[]'::jsonb)
  into v_period_quests
  from public.caleris_quest_assignments a
  join public.caleris_quest_catalog c on c.id=a.quest_id
  where a.member_id=v_member.id and a.assignment_scope='period' and a.period_id=v_period.id;

  select balance into v_wallet_balance from public.economy_wallet_accounts where id=v_wallet_id;

  return jsonb_build_object(
    'member_name',coalesce(v_member.character_name,'Member'),
    'role_scope',v_role_scope,
    'team_id',v_member.team_id,
    'wallet_balance',v_wallet_balance,
    'date',v_day,
    'period',case when v_period.id is null then null else jsonb_build_object(
      'id',v_period.id,'season_id',v_period.season_id,'period_type',v_period.period_type,
      'period_number',v_period.period_number,'title',v_period.title,
      'starts_on',v_period.starts_on,'ends_on',v_period.ends_on
    ) end,
    'daily',v_daily,
    'period_quests',v_period_quests
  );
end;
$function$;

revoke all on function public.member_get_quest_board() from public,anon,service_role;
grant execute on function public.member_get_quest_board() to authenticated;

create or replace function public.admin_process_pending_quest_rewards()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=(select auth.uid());
  v_bank_id uuid;
  v_assignment record;
  v_wallet_id uuid;
  v_tx jsonb;
  v_paid integer:=0;
  v_pending integer:=0;
begin
  if v_user is null or not exists(select 1 from public.site_admins a where a.user_id=v_user) then
    raise exception 'Hanya Admin yang dapat memproses reward Quest.';
  end if;

  select id into v_bank_id from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active;
  if v_bank_id is null then
    return jsonb_build_object('paid',0,'pending',0,'error','VreeoBank tidak tersedia.');
  end if;

  for v_assignment in
    select a.id,a.member_id,a.team_id,a.reward_amount,a.reward_status,
      c.quest_key,c.title,c.role_scope,c.difficulty
    from public.caleris_quest_assignments a
    join public.caleris_quest_catalog c on c.id=a.quest_id
    where a.status='completed' and a.reward_status='pending'
    order by a.created_at,a.id
    for update of a skip locked
  loop
    v_wallet_id:=null;
    if v_assignment.role_scope='driver' then
      select id into v_wallet_id from public.economy_wallet_accounts
      where account_kind='driver' and member_id=v_assignment.member_id and is_active;
    else
      select id into v_wallet_id from public.economy_wallet_accounts
      where account_kind='team_owner' and member_id=v_assignment.member_id and is_active;
    end if;

    if v_wallet_id is null then
      v_pending:=v_pending+1;
      continue;
    end if;

    v_tx:=private.post_economy_transaction(
      v_bank_id,v_wallet_id,v_assignment.reward_amount,'bank_reward',
      'Quest reward: '||v_assignment.title,
      'quest-reward:'||v_assignment.id::text,
      v_user,
      jsonb_build_object(
        'quest_assignment_id',v_assignment.id,
        'quest_key',v_assignment.quest_key,
        'role_scope',v_assignment.role_scope,
        'difficulty',v_assignment.difficulty,
        'source','quest_engine'
      ),
      null,true
    );

    if v_tx is null then
      v_pending:=v_pending+1;
      exit;
    end if;

    update public.caleris_quest_assignments
    set reward_status='paid',
        reward_transaction_id=(v_tx->>'transaction_id')::uuid,
        paid_at=coalesce(paid_at,now())
    where id=v_assignment.id;
    v_paid:=v_paid+1;
  end loop;

  return jsonb_build_object('paid',v_paid,'pending',v_pending);
end;
$function$;

revoke all on function public.admin_process_pending_quest_rewards() from public,anon,service_role;
grant execute on function public.admin_process_pending_quest_rewards() to authenticated;

commit;
