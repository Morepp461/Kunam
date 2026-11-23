begin;

-- Restrict internal trigger helpers. SECURITY DEFINER alone is not an authorization boundary.
revoke all on function public.caleris_log_activity(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.caleris_refresh_driver_milestones(uuid) from public, anon, authenticated;
revoke all on function public.caleris_reverse_race_entry_xp() from public, anon, authenticated;
revoke all on function public.caleris_team_roster_milestone_trigger() from public, anon, authenticated;
revoke all on function public.caleris_refresh_team_milestones(uuid) from public, anon, authenticated;
revoke all on function public.caleris_award_configured_xp(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.caleris_sync_xp_milestones() from public, anon, authenticated;
revoke all on function public.caleris_team_result_milestone_trigger() from public, anon, authenticated;
revoke all on function public.caleris_community_checkin_activity() from public, anon, authenticated;
revoke all on function public.caleris_community_quest_activity() from public, anon, authenticated;
revoke all on function public.caleris_community_shop_activity() from public, anon, authenticated;
revoke all on function public.caleris_xp_race_entry_trigger() from public, anon, authenticated;
revoke all on function public.caleris_xp_checkin_trigger() from public, anon, authenticated;
revoke all on function public.caleris_xp_quest_trigger() from public, anon, authenticated;
revoke all on function public.caleris_xp_shop_trigger() from public, anon, authenticated;
revoke all on function public.caleris_current_member_id() from public, anon;
grant execute on function public.caleris_current_member_id() to authenticated, service_role;

-- A vote record is private. Only aggregate results are exposed after the poll closes.
drop policy if exists "cp votes read" on public.caleris_community_votes;
drop policy if exists "cp votes own read" on public.caleris_community_votes;
create policy "cp votes own read" on public.caleris_community_votes
for select to authenticated
using (voter_member_id = public.caleris_current_member_id());

-- A SECURITY DEFINER predicate lets RLS check public visibility without exposing the card table.
create or replace function public.caleris_is_public_digital_id(p_member uuid)
returns boolean language sql stable security definer set search_path=public
as $public_id_visibility$
  select exists(select 1 from public.caleris_digital_id_cards where member_id=p_member and public_visible=true);
$public_id_visibility$;
revoke all on function public.caleris_is_public_digital_id(uuid) from public,anon;
grant execute on function public.caleris_is_public_digital_id(uuid) to authenticated;

-- Badges are public only when the member explicitly publishes their Digital ID.
drop policy if exists "cp member badges read" on public.caleris_member_badges;
create policy "cp member badges read" on public.caleris_member_badges
for select to authenticated
using (
  member_id = public.caleris_current_member_id()
  or public.caleris_is_public_digital_id(member_id)
);

-- Activity feed events have a stable source identity, so trigger retries cannot duplicate them.
create unique index if not exists caleris_activity_feed_source_unique_idx
on public.caleris_activity_feed(event_type, (metadata->>'source_id'))
where metadata ? 'source_id';

create or replace function public.caleris_log_activity(
  p_actor uuid, p_team uuid, p_type text, p_title text, p_body text, p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path=public
as $activity$
begin
  insert into public.caleris_activity_feed(actor_member_id,team_id,event_type,title,body,metadata,visibility)
  values (
    p_actor,p_team,p_type,left(coalesce(p_title,''),160),left(coalesce(p_body,''),500),
    coalesce(p_meta,'{}'::jsonb),'community'
  )
  on conflict (event_type, (metadata->>'source_id'))
  where (metadata ? 'source_id')
  do nothing;
end;
$activity$;

-- XP awards produced by trusted database triggers must not require the end-user to be an Admin.
-- This helper is private to trigger execution and is not callable through the public API.
create or replace function public.caleris_award_configured_xp(
  p_member uuid, p_source text, p_id text, p_description text
) returns void
language plpgsql security definer set search_path=public
as $configured_xp$
declare reward integer; inserted integer;
begin
  if p_member is null or nullif(trim(p_id),'') is null then return; end if;
  select reward_xp into reward
  from public.caleris_xp_reward_settings
  where source_type=p_source;
  if coalesce(reward,0)<=0 then return; end if;
  if reward>100000 then raise exception 'invalid_xp_reward_configuration'; end if;
  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
  values(p_member,reward,p_source,p_id,left(coalesce(p_description,''),240))
  on conflict(member_id,source_type,source_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted=1 then
    perform public.caleris_log_activity(
      p_member,null,'xp_earned','XP diperoleh',
      '+'||reward||' XP · '||left(coalesce(p_description,''),160),
      jsonb_build_object('amount',reward,'source_type',p_source,'source_id',p_id)
    );
  end if;
end;
$configured_xp$;

create or replace function public.caleris_award_xp(
  p_member_id uuid,p_amount integer,p_source_type text,p_source_id text,p_description text default ''
) returns boolean
language plpgsql security definer set search_path=public
as $award_xp$
declare inserted integer;
begin
  if auth.role()<>'service_role' and not exists(select 1 from public.site_admins where user_id=auth.uid()) then
    raise exception 'not_authorized';
  end if;
  if p_amount<=0 or p_amount>100000 or nullif(trim(p_source_id),'') is null then
    raise exception 'invalid_xp_award';
  end if;
  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
  values(p_member_id,p_amount,p_source_type,p_source_id,left(coalesce(p_description,''),240))
  on conflict(member_id,source_type,source_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted=1 then
    perform public.caleris_log_activity(
      p_member_id,null,'xp_earned','XP diperoleh',
      '+'||p_amount||' XP · '||left(coalesce(p_description,''),160),
      jsonb_build_object('amount',p_amount,'source_type',p_source_type,'source_id',p_source_id)
    );
  end if;
  return inserted=1;
end;
$award_xp$;

-- A deleted official race entry reverses its participation XP instead of leaving stale career totals.
alter table public.caleris_xp_ledger drop constraint if exists caleris_xp_ledger_amount_check;
alter table public.caleris_xp_ledger add constraint caleris_xp_ledger_amount_check check(amount<>0);

create or replace function public.caleris_reverse_race_entry_xp()
returns trigger language plpgsql security definer set search_path=public
as $reverse_race_xp$
declare awarded integer;
begin
  if old.member_id is not null then
    select amount into awarded
    from public.caleris_xp_ledger
    where member_id=old.member_id and source_type='race_result' and source_id=old.id::text;
    if found and awarded>0 then
      insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
      values(old.member_id,-awarded,'admin_adjustment','race_result_reversal:'||old.id,
        'Reversal: official race result entry removed')
      on conflict(member_id,source_type,source_id) do nothing;
      perform public.caleris_log_activity(
        old.member_id,old.team_id,'xp_adjustment','Koreksi XP',
        'XP partisipasi dikoreksi karena entri hasil resmi dihapus.',
        jsonb_build_object('source_id','race_result_reversal:'||old.id,'source_type','race_result')
      );
    end if;
  end if;
  return old;
end;
$reverse_race_xp$;
drop trigger if exists caleris_xp_race_entry_reversal on public.caleris_race_result_entries;
create trigger caleris_xp_race_entry_reversal
after delete on public.caleris_race_result_entries
for each row execute function public.caleris_reverse_race_entry_xp();

-- Driver career milestones are derived only from completed official rounds.
create or replace function public.caleris_refresh_driver_milestones(p_member uuid)
returns void
language plpgsql security definer set search_path=public
as $driver_milestones$
declare d record; metric_value numeric; total_xp numeric; inserted integer;
begin
  if p_member is null or not exists(select 1 from public.members where id=p_member) then return; end if;
  select coalesce(sum(amount),0) into total_xp
  from public.caleris_xp_ledger where member_id=p_member;

  for d in
    select * from public.caleris_milestone_definitions
    where active=true and scope='driver'
  loop
    metric_value := case d.metric_key
      when 'xp_total' then total_xp
      when 'driver_race_starts' then (
        select count(distinct e.round_id)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.member_id=p_member and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      )
      when 'driver_wins' then (
        select count(*)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.member_id=p_member and e.finishing_position=1
          and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      )
      when 'driver_podiums' then (
        select count(*)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.member_id=p_member and e.finishing_position between 1 and 3
          and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      )
      when 'driver_points' then (
        select coalesce(sum(rs.points_total),0)::numeric
        from public.license_round_standings rs
        join public.license_rounds r on r.id=rs.round_id
        where rs.member_id=p_member
          and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      )
      else null
    end;
    if metric_value is null then continue; end if;

    insert into public.caleris_milestone_progress(milestone_id,scope,member_id,current_value,completed_at)
    values(d.id,'driver',p_member,metric_value,
      case when metric_value>=d.target_value then now() end)
    on conflict(milestone_id,member_id) do update
      set current_value=excluded.current_value,
          completed_at=case
            when excluded.current_value>=d.target_value
              then coalesce(caleris_milestone_progress.completed_at,excluded.completed_at)
            else caleris_milestone_progress.completed_at
          end,
          updated_at=now();

    if metric_value>=d.target_value then
      if d.badge_code is not null then
        insert into public.caleris_member_badges(member_id,badge_code,source_type,source_id)
        values(p_member,d.badge_code,'milestone',d.code)
        on conflict do nothing;
      end if;
      if coalesce(d.xp_reward,0)>0 then
        insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
        values(p_member,d.xp_reward,'milestone',d.code,'Milestone reward: '||d.title)
        on conflict(member_id,source_type,source_id) do nothing;
        get diagnostics inserted = row_count;
        if inserted=1 then
          perform public.caleris_log_activity(
            p_member,null,'milestone_completed','Milestone tercapai',d.title,
            jsonb_build_object('source_id','milestone:'||d.code,'metric_key',d.metric_key,'target',d.target_value)
          );
        end if;
      end if;
    end if;
  end loop;
end;
$driver_milestones$;

create or replace function public.caleris_refresh_team_milestones(p_team uuid)
returns void language plpgsql security definer set search_path=public
as $team_milestones$
declare d record; metric_value numeric;
begin
  if p_team is null then return; end if;
  for d in
    select * from public.caleris_milestone_definitions
    where active=true and scope='team'
  loop
    metric_value := case d.metric_key
      when 'team_races' then (
        select count(distinct e.round_id)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.team_id=p_team and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      )
      when 'team_wins' then (
        select count(*)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.team_id=p_team and e.finishing_position=1
          and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      )
      when 'team_podiums' then (
        select count(*)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.team_id=p_team and e.finishing_position between 1 and 3
          and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      )
      when 'team_drivers' then (
        select count(*)::numeric from public.members m
        where m.team_id=p_team and m.role='Driver'
      )
      else null
    end;
    if metric_value is null then continue; end if;
    insert into public.caleris_milestone_progress(milestone_id,scope,team_id,current_value,completed_at)
    values(d.id,'team',p_team,metric_value,
      case when metric_value>=d.target_value then now() end)
    on conflict(milestone_id,team_id) do update
      set current_value=excluded.current_value,
          completed_at=case
            when excluded.current_value>=d.target_value
              then coalesce(caleris_milestone_progress.completed_at,excluded.completed_at)
            else caleris_milestone_progress.completed_at
          end,
          updated_at=now();
  end loop;
end;
$team_milestones$;

create or replace function public.caleris_team_result_milestone_trigger()
returns trigger language plpgsql security definer set search_path=public
as $team_result$
begin
  if tg_op='DELETE' then
    perform public.caleris_refresh_team_milestones(old.team_id);
    perform public.caleris_refresh_driver_milestones(old.member_id);
    return old;
  end if;
  if tg_op='UPDATE' then
    if old.team_id is distinct from new.team_id then
      perform public.caleris_refresh_team_milestones(old.team_id);
    end if;
    if old.member_id is distinct from new.member_id then
      perform public.caleris_refresh_driver_milestones(old.member_id);
    end if;
  end if;
  perform public.caleris_refresh_team_milestones(new.team_id);
  perform public.caleris_refresh_driver_milestones(new.member_id);
  if tg_op='INSERT' then
    perform public.caleris_log_activity(
      new.member_id,new.team_id,'race_result','Hasil balapan tercatat',
      coalesce(new.driver_name_snapshot,'Driver')||' menyelesaikan ronde dengan posisi '||coalesce(new.finishing_position::text,'-'),
      jsonb_build_object('source_id',new.id::text,'round_id',new.round_id,'position',new.finishing_position)
    );
  end if;
  return new;
end;
$team_result$;
drop trigger if exists caleris_community_race_activity on public.caleris_race_result_entries;
create trigger caleris_community_race_activity
after insert or update or delete on public.caleris_race_result_entries
for each row execute function public.caleris_team_result_milestone_trigger();

create or replace function public.caleris_team_roster_milestone_trigger()
returns trigger language plpgsql security definer set search_path=public
as $team_roster$
begin
  if tg_op='DELETE' then
    perform public.caleris_refresh_team_milestones(old.team_id);
    return old;
  end if;
  if tg_op='UPDATE' and old.team_id is distinct from new.team_id then
    perform public.caleris_refresh_team_milestones(old.team_id);
  end if;
  perform public.caleris_refresh_team_milestones(new.team_id);
  return new;
end;
$team_roster$;
drop trigger if exists caleris_team_roster_milestone_sync on public.members;
create trigger caleris_team_roster_milestone_sync
after insert or delete or update of team_id,role on public.members
for each row execute function public.caleris_team_roster_milestone_trigger();

create or replace function public.caleris_community_checkin_activity()
returns trigger language plpgsql security definer set search_path=public
as $checkin_activity$
declare team uuid;
begin
  select team_id into team from public.members where id=new.member_id;
  perform public.caleris_log_activity(
    new.member_id,team,'checkin','Race check-in','Member melakukan check-in race.',
    jsonb_build_object('source_id',new.id::text,'round_id',new.round_id,'date',new.checkin_date)
  );
  return new;
end;
$checkin_activity$;

create or replace function public.caleris_community_quest_activity()
returns trigger language plpgsql security definer set search_path=public
as $quest_activity$
declare team uuid;
begin
  if new.completed_at is not null and old.completed_at is distinct from new.completed_at then
    team:=new.team_id;
    perform public.caleris_log_activity(
      new.member_id,team,'quest_completed','Quest diselesaikan','Member menyelesaikan quest.',
      jsonb_build_object('source_id',new.id::text,'quest_assignment_id',new.id,'scope',new.assignment_scope)
    );
  end if;
  return new;
end;
$quest_activity$;

create or replace function public.caleris_community_shop_activity()
returns trigger language plpgsql security definer set search_path=public
as $shop_activity$
declare team uuid;
begin
  select team_id into team from public.members where id=new.member_id;
  perform public.caleris_log_activity(
    new.member_id,team,'development_purchase','Development dibeli',
    'Pembelian token development tercatat.',
    jsonb_build_object('source_id',new.id::text,'purchase_id',new.id,'token_type',new.token_type,'quantity',new.quantity)
  );
  return new;
end;
$shop_activity$;

create or replace function public.caleris_sync_xp_milestones()
returns trigger language plpgsql security definer set search_path=public
as $xp_sync$
declare total_xp numeric; d record; inserted integer;
begin
  select coalesce(sum(amount),0) into total_xp
  from public.caleris_xp_ledger where member_id=new.member_id;
  for d in
    select * from public.caleris_milestone_definitions
    where scope='driver' and metric_key='xp_total' and active
  loop
    insert into public.caleris_milestone_progress(milestone_id,scope,member_id,current_value,completed_at)
    values(d.id,'driver',new.member_id,total_xp,
      case when total_xp>=d.target_value then now() end)
    on conflict(milestone_id,member_id) do update
      set current_value=excluded.current_value,
          completed_at=case
            when excluded.current_value>=d.target_value
              then coalesce(caleris_milestone_progress.completed_at,excluded.completed_at)
            else caleris_milestone_progress.completed_at
          end,
          updated_at=now();
    if total_xp>=d.target_value then
      if d.badge_code is not null then
        insert into public.caleris_member_badges(member_id,badge_code,source_type,source_id)
        values(new.member_id,d.badge_code,'milestone',d.code)
        on conflict do nothing;
      end if;
      if coalesce(d.xp_reward,0)>0 then
        insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
        values(new.member_id,d.xp_reward,'milestone',d.code,'Milestone reward: '||d.title)
        on conflict(member_id,source_type,source_id) do nothing;
        get diagnostics inserted = row_count;
        if inserted=1 then
          perform public.caleris_log_activity(
            new.member_id,null,'milestone_completed','Milestone tercapai',d.title,
            jsonb_build_object('source_id','milestone:'||d.code,'metric_key',d.metric_key,'target',d.target_value)
          );
        end if;
      end if;
    end if;
  end loop;
  return new;
end;
$xp_sync$;
drop trigger if exists caleris_xp_milestone_sync on public.caleris_xp_ledger;
create trigger caleris_xp_milestone_sync after insert on public.caleris_xp_ledger
for each row execute function public.caleris_sync_xp_milestones();

create or replace function public.caleris_get_community_dashboard()
returns jsonb
language plpgsql stable security definer set search_path=public
as $dashboard$
declare member_id uuid; team uuid; total_xp numeric; payload jsonb;
begin
  member_id:=public.caleris_current_member_id();
  if auth.uid() is null or member_id is null then raise exception 'member_profile_required'; end if;
  select m.team_id into team from public.members m where m.id=member_id;
  select coalesce(sum(amount),0) into total_xp from public.caleris_xp_ledger where caleris_xp_ledger.member_id=member_id;
  select jsonb_build_object(
    'member_id',member_id,
    'total_xp',total_xp,
    'level',public.caleris_xp_level(total_xp),
    'driver_stats',jsonb_build_object(
      'race_starts',(select count(distinct e.round_id) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'),
      'wins',(select count(*) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and e.finishing_position=1 and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'),
      'podiums',(select count(*) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and e.finishing_position between 1 and 3 and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'),
      'points',(select coalesce(sum(rs.points_total),0) from public.license_round_standings rs join public.license_rounds r on r.id=rs.round_id where rs.member_id=member_id and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed')
    ),
    'team_id',team
  ) into payload;
  return payload;
end;
$dashboard$;

create or replace function public.caleris_admin_save_milestone(
  p_code text,p_scope text,p_title text,p_description text,p_metric_key text,
  p_target numeric,p_xp_reward integer default 0,p_badge_code text default null,p_active boolean default true
) returns uuid
language plpgsql security definer set search_path=public
as $save_milestone$
declare milestone_id uuid;
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  if p_code is null or p_code !~ '^[a-z0-9_]{3,80}
    raise exception 'invalid_milestone_definition';
  end if;
  if p_scope='driver' and p_metric_key not in('xp_total','driver_race_starts','driver_wins','driver_podiums','driver_points') then
    raise exception 'invalid_driver_metric';
  end if;
  if p_scope='team' and p_metric_key not in('team_races','team_wins','team_podiums','team_drivers') then
    raise exception 'invalid_team_metric';
  end if;
  if p_scope='team' and p_xp_reward<>0 then raise exception 'team_xp_rewards_not_supported'; end if;
  if p_badge_code is not null and not exists(select 1 from public.caleris_achievement_badges where code=p_badge_code) then
    raise exception 'badge_not_found';
  end if;
  if exists(select 1 from public.caleris_milestone_definitions where code=p_code and (scope<>p_scope or metric_key<>p_metric_key)) then
    raise exception 'milestone_identity_immutable';
  end if;
  insert into public.caleris_milestone_definitions(scope,code,title,description,metric_key,target_value,xp_reward,badge_code,active)
  values(p_scope,p_code,left(trim(p_title),120),left(coalesce(p_description,''),500),p_metric_key,p_target,coalesce(p_xp_reward,0),p_badge_code,coalesce(p_active,true))
  on conflict(code) do update set
    title=excluded.title,description=excluded.description,target_value=excluded.target_value,
    xp_reward=excluded.xp_reward,badge_code=excluded.badge_code,active=excluded.active
  returning id into milestone_id;
  if p_scope='driver' then
    perform public.caleris_refresh_driver_milestones(m.id)
    from public.members m;
  else
    perform public.caleris_refresh_team_milestones(t.id)
    from public.teams t;
  end if;
  return milestone_id;
end;
$save_milestone$;

create or replace function public.caleris_admin_adjust_xp(
  p_member_id uuid,p_amount integer,p_source_id text,p_description text
) returns jsonb
language plpgsql security definer set search_path=public
as $adjust_xp$
declare current_total numeric; inserted integer;
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  if p_amount is null or p_amount=0 or abs(p_amount)>100000 or nullif(trim(p_source_id),'') is null
    or nullif(trim(p_description),'') is null then raise exception 'invalid_xp_adjustment'; end if;
  perform 1 from public.members where id=p_member_id for update;
  if not found then raise exception 'member_not_found'; end if;
  select coalesce(sum(amount),0) into current_total from public.caleris_xp_ledger where member_id=p_member_id;
  if current_total+p_amount<0 then raise exception 'xp_total_cannot_be_negative'; end if;
  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
  values(p_member_id,p_amount,'admin_adjustment',trim(p_source_id),left(trim(p_description),240))
  on conflict(member_id,source_type,source_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted=1 then
    perform public.caleris_log_activity(
      p_member_id,null,'xp_adjustment','Penyesuaian XP',
      case when p_amount>0 then '+' else '' end||p_amount||' XP · '||left(trim(p_description),160),
      jsonb_build_object('source_id',trim(p_source_id),'amount',p_amount)
    );
  end if;
  select coalesce(sum(amount),0) into current_total from public.caleris_xp_ledger where member_id=p_member_id;
  return jsonb_build_object('member_id',p_member_id,'total_xp',current_total,'inserted',inserted=1);
end;
$adjust_xp$;

create or replace function public.caleris_admin_create_poll(
  p_title text,p_description text,p_type text,p_ends_at timestamptz,p_options jsonb,p_season_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public
as $create_poll$
declare poll_id uuid; item jsonb; candidate_member uuid; candidate_team uuid; candidate_label text; candidate_key text; is_team_poll boolean; seen_candidates text[]:=array[]::text[];
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  if nullif(trim(p_title),'') is null or length(p_title)>160 or length(coalesce(p_description,''))>1000 then
    raise exception 'invalid_poll_text';
  end if;
  if p_type is null or p_type not in('driver_of_period','team_of_period','driver_of_season','team_of_season','fia_nomination') then
    raise exception 'invalid_poll_type';
  end if;
  if p_ends_at is null or p_ends_at<=now() then raise exception 'poll_end_must_be_future'; end if;
  if p_season_id is not null and not exists(select 1 from public.license_seasons where id=p_season_id) then
    raise exception 'season_not_found';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array'
    or jsonb_array_length(p_options)<2 or jsonb_array_length(p_options)>50 then
    raise exception 'poll_requires_two_to_fifty_options';
  end if;
  is_team_poll:=p_type in('team_of_period','team_of_season');
  insert into public.caleris_community_polls(title,description,poll_type,status,starts_at,ends_at,season_id,created_by)
  values(left(trim(p_title),160),left(coalesce(p_description,''),1000),p_type,'open',now(),p_ends_at,p_season_id,auth.uid())
  returning id into poll_id;
  for item in select value from jsonb_array_elements(p_options) as options(value) loop
    candidate_member:=nullif(item->>'member_id','')::uuid;
    candidate_team:=nullif(item->>'team_id','')::uuid;
    candidate_label:=left(trim(coalesce(item->>'label','')),120);
    if candidate_label='' then raise exception 'candidate_label_required'; end if;
    if is_team_poll then
      if candidate_team is null or candidate_member is not null
        or not exists(select 1 from public.teams where id=candidate_team) then
        raise exception 'invalid_team_candidate';
      end if;
      candidate_key:='team:'||candidate_team::text;
    else
      if candidate_member is null or candidate_team is not null
        or not exists(select 1 from public.members where id=candidate_member) then
        raise exception 'invalid_member_candidate';
      end if;
      if p_type in('driver_of_period','driver_of_season')
        and not exists(select 1 from public.members where id=candidate_member and role='Driver') then
        raise exception 'driver_candidate_required';
      end if;
      candidate_key:='member:'||candidate_member::text;
    end if;
    if candidate_key=any(seen_candidates) then raise exception 'duplicate_poll_candidate'; end if;
    seen_candidates:=array_append(seen_candidates,candidate_key);
    insert into public.caleris_community_poll_options(poll_id,member_id,team_id,label)
    values(poll_id,candidate_member,candidate_team,candidate_label);
  end loop;
  return poll_id;
end;
$create_poll$;

create or replace function public.caleris_cast_community_vote(p_poll_id uuid,p_option_id uuid)
returns void language plpgsql security definer set search_path=public
as $cast_vote$
declare member_id uuid:=public.caleris_current_member_id(); poll public.caleris_community_polls%rowtype;
begin
  if auth.uid() is null or member_id is null then raise exception 'member_profile_required'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id for update;
  if not found or poll.status<>'open' or now()<poll.starts_at or now()>=poll.ends_at then raise exception 'poll_not_open'; end if;
  if not exists(select 1 from public.caleris_community_poll_options where id=p_option_id and poll_id=p_poll_id) then
    raise exception 'invalid_option';
  end if;
  insert into public.caleris_community_votes(poll_id,voter_member_id,option_id)
  values(p_poll_id,member_id,p_option_id);
  perform public.caleris_log_activity(
    member_id,(select team_id from public.members where id=member_id),
    'community_vote','Member berpartisipasi dalam voting','Suara komunitas telah dicatat.',
    jsonb_build_object('source_id',p_poll_id::text||':'||member_id::text,'poll_id',p_poll_id)
  );
  insert into public.caleris_member_badges(member_id,badge_code,source_type,source_id)
  values(member_id,'community_voice','community_vote',p_poll_id::text)
  on conflict do nothing;
end;
$cast_vote$;

create or replace function public.caleris_get_community_poll_results(p_poll_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $poll_results$
declare poll public.caleris_community_polls%rowtype; payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id;
  if not found then raise exception 'poll_not_found'; end if;
  if poll.status not in('closed','published') and poll.ends_at>now() then raise exception 'poll_results_not_available'; end if;
  select jsonb_build_object(
    'poll_id',poll.id,
    'status',case when poll.status='open' and poll.ends_at<=now() then 'ended_pending_finalization' else poll.status end,
    'total_votes',(select count(*) from public.caleris_community_votes v where v.poll_id=poll.id),
    'options',coalesce((
      select jsonb_agg(jsonb_build_object(
        'option_id',counts.id,'label',counts.label,'votes',counts.vote_count
      ) order by counts.vote_count desc,counts.label)
      from (
        select o.id,o.label,count(v.id)::integer as vote_count
        from public.caleris_community_poll_options o
        left join public.caleris_community_votes v on v.option_id=o.id
        where o.poll_id=poll.id
        group by o.id,o.label
      ) counts
    ),'[]'::jsonb)
  ) into payload;
  return payload;
end;
$poll_results$;

create or replace function public.caleris_admin_finalize_poll(p_poll_id uuid,p_publish boolean default false)
returns jsonb language plpgsql security definer set search_path=public
as $finalize_poll$
declare poll public.caleris_community_polls%rowtype;
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id for update;
  if not found or poll.status='draft' then raise exception 'poll_not_found_or_not_open'; end if;
  update public.caleris_community_polls
  set status=case when coalesce(p_publish,false) then 'published' else 'closed' end
  where id=p_poll_id;
  return public.caleris_get_community_poll_results(p_poll_id);
end;
$finalize_poll$;

-- Generate a trusted yearbook snapshot server-side. Client-supplied JSON is deliberately ignored.
create or replace function public.caleris_generate_yearbook(p_season uuid,p_title text default null)
returns jsonb language plpgsql security definer set search_path=public
as $generate_yearbook$
declare member_id uuid; member_row public.members%rowtype; total_xp numeric; official jsonb; snapshot jsonb; team_name text;
begin
  member_id:=public.caleris_current_member_id();
  if auth.uid() is null or member_id is null then raise exception 'member_profile_required'; end if;
  select * into member_row from public.members where id=member_id;
  if not found then raise exception 'member_not_found'; end if;
  official:=public.caleris_get_season_community_data(p_season);
  if official->'season' is null or official->'season'='null'::jsonb then raise exception 'season_not_found'; end if;
  select coalesce(sum(amount),0) into total_xp from public.caleris_xp_ledger where caleris_xp_ledger.member_id=member_id;
  select name into team_name from public.teams where id=member_row.team_id;
  snapshot:=jsonb_build_object(
    'snapshot_version',2,
    'generated_at',now(),
    'season',official->'season',
    'official_season_data',official,
    'member',jsonb_build_object(
      'member_code',member_row.member_code,
      'character_name',member_row.character_name,
      'role',member_row.role,
      'license',member_row.license,
      'team_name',team_name
    ),
    'xp',total_xp,
    'level',public.caleris_xp_level(total_xp),
    'badges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',b.code,'title',b.title,'description',b.description,'icon',b.icon,'rarity',b.rarity,'awarded_at',mb.awarded_at
      ) order by mb.awarded_at)
      from public.caleris_member_badges mb
      join public.caleris_achievement_badges b on b.code=mb.badge_code
      where mb.member_id=member_id
    ),'[]'::jsonb),
    'activity',coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select f.title,f.body,f.event_type,f.created_at
        from public.caleris_activity_feed f
        where f.visibility='community'
          or f.actor_member_id=member_id
          or (f.visibility='team' and f.team_id=member_row.team_id)
        order by f.created_at desc limit 50
      ) recent
    ),'[]'::jsonb)
  );
  insert into public.caleris_season_yearbooks(season_id,member_id,title,content,status,generated_by)
  values(p_season,member_id,left(coalesce(nullif(trim(p_title),''),(official->'season'->>'title')||' Yearbook'),160),snapshot,'draft',auth.uid())
  on conflict(member_id,season_id) do update
    set title=excluded.title,content=excluded.content,status='draft',generated_at=now(),generated_by=auth.uid();
  return snapshot;
end;
$generate_yearbook$;

create or replace function public.caleris_save_yearbook(p_season uuid,p_title text,p_content jsonb)
returns void language plpgsql security definer set search_path=public
as $legacy_yearbook$
begin
  perform public.caleris_generate_yearbook(p_season,p_title);
end;
$legacy_yearbook$;

-- A public verification endpoint exposes only the fields intentionally included in Digital ID.
create or replace function public.caleris_get_public_digital_id(p_member_code text)
returns jsonb language sql stable security definer set search_path=public
as $public_id$
  select jsonb_build_object(
    'card',jsonb_build_object(
      'theme',card.theme,'accent_color',card.accent_color,'tagline',card.tagline,'updated_at',card.updated_at
    ),
    'member',jsonb_build_object(
      'member_code',m.member_code,'character_name',m.character_name,'role',m.role,
      'license',m.license,'team_name',team.name
    ),
    'badges',coalesce((
      select jsonb_agg(jsonb_build_object('code',b.code,'title',b.title,'description',b.description,'icon',b.icon,'rarity',b.rarity,'awarded_at',mb.awarded_at) order by mb.awarded_at)
      from public.caleris_member_badges mb
      join public.caleris_achievement_badges b on b.code=mb.badge_code and b.active=true
      where mb.member_id=m.id
    ),'[]'::jsonb)
  )
  from public.members m
  join public.caleris_digital_id_cards card on card.member_id=m.id and card.public_visible=true
  left join public.teams team on team.id=m.team_id
  where upper(m.member_code)=upper(trim(p_member_code))
  limit 1;
$public_id$;

-- Official predictor standings only include completed rounds. Scheduled rounds remain available for simulation.
create or replace function public.caleris_get_season_community_data(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $season_data$
declare payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'season',(select to_jsonb(s) from public.license_seasons s where s.id=p_season),
    'divisions',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from public.license_season_divisions d where d.season_id=p_season),
    'current_driver_standings',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'season_division_id',d.id,'division_name',d.division_name,'member_id',rs.member_id,
        'driver_name_snapshot',max(rs.driver_name_snapshot),'team_id_snapshot',max(rs.team_id_snapshot),
        'team_name_snapshot',max(rs.team_name_snapshot),'final_points',sum(rs.points_total)
      ) order by sum(rs.points_total) desc),'[]'::jsonb)
      from public.license_round_standings rs
      join public.license_rounds r on r.id=rs.round_id
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
        and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      group by d.id,d.division_name,rs.member_id
    ),
    'driver_standings',(
      select coalesce(jsonb_agg(to_jsonb(fs)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_final_standings fs
      join public.license_season_divisions d on d.id=fs.season_division_id
      where d.season_id=p_season
    ),
    'team_standings',(
      select coalesce(jsonb_agg(to_jsonb(ts)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_team_final_standings ts
      join public.license_season_divisions d on d.id=ts.season_division_id
      where d.season_id=p_season
    ),
    'rounds',(
      select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_rounds r
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
    ),
    'race_results',(
      select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('round_number',r.round_number,'division_name',d.division_name)),'[]'::jsonb)
      from public.caleris_race_result_entries e
      join public.license_rounds r on r.id=e.round_id
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
        and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
    ),
    'scoring_rules',(
      select coalesce(jsonb_agg(to_jsonb(pr)),'[]'::jsonb)
      from public.caleris_race_points_rules pr where pr.is_active
    )
  ) into payload;
  if payload->'season' is null or payload->'season'='null'::jsonb then raise exception 'season_not_found'; end if;
  return coalesce(payload,'{}'::jsonb);
end;
$season_data$;

-- Existing hard-coded Team XP milestones are not backed by a Team XP ledger.
update public.caleris_milestone_definitions
set active=false
where scope='team' and metric_key='team_xp';

-- Only reset untouched seed rewards. Existing awarded history is preserved.
update public.caleris_milestone_definitions d
set xp_reward=0
where d.code in('driver_xp_50','driver_xp_100','driver_xp_200','driver_xp_400','driver_xp_800','driver_xp_1600','driver_xp_3200','driver_xp_6400')
  and not exists(
    select 1 from public.caleris_xp_ledger ledger
    where ledger.member_id in(select id from public.members)
      and ledger.source_type='milestone' and ledger.source_id=d.code
  );

-- Replace public vote, badge and Digital ID reads with the privacy rules above.
revoke all on function public.caleris_cast_community_vote(uuid,uuid) from public,anon;
grant execute on function public.caleris_cast_community_vote(uuid,uuid) to authenticated;
revoke all on function public.caleris_save_digital_id(text,text,text,boolean) from public,anon;
grant execute on function public.caleris_save_digital_id(text,text,text,boolean) to authenticated;
revoke all on function public.caleris_admin_create_poll(text,text,text,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.caleris_admin_create_poll(text,text,text,timestamptz,jsonb,uuid) to authenticated;
revoke all on function public.caleris_save_yearbook(uuid,text,jsonb) from public,anon;
grant execute on function public.caleris_save_yearbook(uuid,text,jsonb) to authenticated;
revoke all on function public.caleris_set_xp_reward(text,integer) from public,anon;
grant execute on function public.caleris_set_xp_reward(text,integer) to authenticated;
revoke all on function public.caleris_get_season_community_data(uuid) from public,anon;
grant execute on function public.caleris_get_season_community_data(uuid) to authenticated;
revoke all on function public.caleris_generate_yearbook(uuid,text) from public,anon;
grant execute on function public.caleris_generate_yearbook(uuid,text) to authenticated;
revoke all on function public.caleris_get_community_dashboard() from public,anon;
grant execute on function public.caleris_get_community_dashboard() to authenticated;
revoke all on function public.caleris_admin_save_milestone(text,text,text,text,text,numeric,integer,text,boolean) from public,anon;
grant execute on function public.caleris_admin_save_milestone(text,text,text,text,text,numeric,integer,text,boolean) to authenticated;
revoke all on function public.caleris_admin_adjust_xp(uuid,integer,text,text) from public,anon;
grant execute on function public.caleris_admin_adjust_xp(uuid,integer,text,text) to authenticated;
revoke all on function public.caleris_get_community_poll_results(uuid) from public,anon;
grant execute on function public.caleris_get_community_poll_results(uuid) to authenticated;
revoke all on function public.caleris_admin_finalize_poll(uuid,boolean) from public,anon;
grant execute on function public.caleris_admin_finalize_poll(uuid,boolean) to authenticated;
revoke all on function public.caleris_get_public_digital_id(text) from public;
grant execute on function public.caleris_get_public_digital_id(text) to anon,authenticated;

-- Backfill career and roster milestones without touching wallets or competition records.
do $backfill$
declare item record;
begin
  for item in select id from public.members loop
    perform public.caleris_refresh_driver_milestones(item.id);
  end loop;
  for item in select id from public.teams loop
    perform public.caleris_refresh_team_milestones(item.id);
  end loop;
end;
$backfill$;

commit;
 or p_scope is null or p_scope not in('driver','team')
    or p_metric_key is null or nullif(trim(p_title),'') is null or p_target is null or p_target<=0
    or coalesce(p_xp_reward,0)<0 or coalesce(p_xp_reward,0)>100000 then
    raise exception 'invalid_milestone_definition';
  end if;
  if p_scope='driver' and p_metric_key not in('xp_total','driver_race_starts','driver_wins','driver_podiums','driver_points') then
    raise exception 'invalid_driver_metric';
  end if;
  if p_scope='team' and p_metric_key not in('team_races','team_wins','team_podiums','team_drivers') then
    raise exception 'invalid_team_metric';
  end if;
  if p_scope='team' and p_xp_reward<>0 then raise exception 'team_xp_rewards_not_supported'; end if;
  if p_badge_code is not null and not exists(select 1 from public.caleris_achievement_badges where code=p_badge_code) then
    raise exception 'badge_not_found';
  end if;
  if exists(select 1 from public.caleris_milestone_definitions where code=p_code and (scope<>p_scope or metric_key<>p_metric_key)) then
    raise exception 'milestone_identity_immutable';
  end if;
  insert into public.caleris_milestone_definitions(scope,code,title,description,metric_key,target_value,xp_reward,badge_code,active)
  values(p_scope,p_code,left(trim(p_title),120),left(coalesce(p_description,''),500),p_metric_key,p_target,coalesce(p_xp_reward,0),p_badge_code,coalesce(p_active,true))
  on conflict(code) do update set
    title=excluded.title,description=excluded.description,target_value=excluded.target_value,
    xp_reward=excluded.xp_reward,badge_code=excluded.badge_code,active=excluded.active
  returning id into milestone_id;
  if p_scope='driver' then
    perform public.caleris_refresh_driver_milestones(m.id)
    from public.members m;
  else
    perform public.caleris_refresh_team_milestones(t.id)
    from public.teams t;
  end if;
  return milestone_id;
end;
$save_milestone$;

create or replace function public.caleris_admin_adjust_xp(
  p_member_id uuid,p_amount integer,p_source_id text,p_description text
) returns jsonb
language plpgsql security definer set search_path=public
as $adjust_xp$
declare current_total numeric; inserted integer;
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  if p_amount=0 or abs(p_amount)>100000 or nullif(trim(p_source_id),'') is null
    or nullif(trim(p_description),'') is null then raise exception 'invalid_xp_adjustment'; end if;
  perform 1 from public.members where id=p_member_id for update;
  if not found then raise exception 'member_not_found'; end if;
  select coalesce(sum(amount),0) into current_total from public.caleris_xp_ledger where member_id=p_member_id;
  if current_total+p_amount<0 then raise exception 'xp_total_cannot_be_negative'; end if;
  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
  values(p_member_id,p_amount,'admin_adjustment',trim(p_source_id),left(trim(p_description),240))
  on conflict(member_id,source_type,source_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted=1 then
    perform public.caleris_log_activity(
      p_member_id,null,'xp_adjustment','Penyesuaian XP',
      case when p_amount>0 then '+' else '' end||p_amount||' XP · '||left(trim(p_description),160),
      jsonb_build_object('source_id',trim(p_source_id),'amount',p_amount)
    );
  end if;
  select coalesce(sum(amount),0) into current_total from public.caleris_xp_ledger where member_id=p_member_id;
  return jsonb_build_object('member_id',p_member_id,'total_xp',current_total,'inserted',inserted=1);
end;
$adjust_xp$;

create or replace function public.caleris_admin_create_poll(
  p_title text,p_description text,p_type text,p_ends_at timestamptz,p_options jsonb,p_season_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public
as $create_poll$
declare poll_id uuid; item jsonb; candidate_member uuid; candidate_team uuid; candidate_label text; candidate_key text; is_team_poll boolean; seen_candidates text[]:=array[]::text[];
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  if nullif(trim(p_title),'') is null or length(p_title)>160 or length(coalesce(p_description,''))>1000 then
    raise exception 'invalid_poll_text';
  end if;
  if p_type is null or p_type not in('driver_of_period','team_of_period','driver_of_season','team_of_season','fia_nomination') then
    raise exception 'invalid_poll_type';
  end if;
  if p_ends_at is null or p_ends_at<=now() then raise exception 'poll_end_must_be_future'; end if;
  if p_season_id is not null and not exists(select 1 from public.license_seasons where id=p_season_id) then
    raise exception 'season_not_found';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array'
    or jsonb_array_length(p_options)<2 or jsonb_array_length(p_options)>50 then
    raise exception 'poll_requires_two_to_fifty_options';
  end if;
  is_team_poll:=p_type in('team_of_period','team_of_season');
  insert into public.caleris_community_polls(title,description,poll_type,status,starts_at,ends_at,season_id,created_by)
  values(left(trim(p_title),160),left(coalesce(p_description,''),1000),p_type,'open',now(),p_ends_at,p_season_id,auth.uid())
  returning id into poll_id;
  for item in select value from jsonb_array_elements(p_options) as options(value) loop
    candidate_member:=nullif(item->>'member_id','')::uuid;
    candidate_team:=nullif(item->>'team_id','')::uuid;
    candidate_label:=left(trim(coalesce(item->>'label','')),120);
    if candidate_label='' then raise exception 'candidate_label_required'; end if;
    if is_team_poll then
      if candidate_team is null or candidate_member is not null
        or not exists(select 1 from public.teams where id=candidate_team) then
        raise exception 'invalid_team_candidate';
      end if;
      candidate_key:='team:'||candidate_team::text;
    else
      if candidate_member is null or candidate_team is not null
        or not exists(select 1 from public.members where id=candidate_member) then
        raise exception 'invalid_member_candidate';
      end if;
      if p_type in('driver_of_period','driver_of_season')
        and not exists(select 1 from public.members where id=candidate_member and role='Driver') then
        raise exception 'driver_candidate_required';
      end if;
      candidate_key:='member:'||candidate_member::text;
    end if;
    if candidate_key=any(seen_candidates) then raise exception 'duplicate_poll_candidate'; end if;
    seen_candidates:=array_append(seen_candidates,candidate_key);
    insert into public.caleris_community_poll_options(poll_id,member_id,team_id,label)
    values(poll_id,candidate_member,candidate_team,candidate_label);
  end loop;
  return poll_id;
end;
$create_poll$;

create or replace function public.caleris_cast_community_vote(p_poll_id uuid,p_option_id uuid)
returns void language plpgsql security definer set search_path=public
as $cast_vote$
declare member_id uuid:=public.caleris_current_member_id(); poll public.caleris_community_polls%rowtype;
begin
  if auth.uid() is null or member_id is null then raise exception 'member_profile_required'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id for update;
  if not found or poll.status<>'open' or now()<poll.starts_at or now()>=poll.ends_at then raise exception 'poll_not_open'; end if;
  if not exists(select 1 from public.caleris_community_poll_options where id=p_option_id and poll_id=p_poll_id) then
    raise exception 'invalid_option';
  end if;
  insert into public.caleris_community_votes(poll_id,voter_member_id,option_id)
  values(p_poll_id,member_id,p_option_id);
  perform public.caleris_log_activity(
    member_id,(select team_id from public.members where id=member_id),
    'community_vote','Member berpartisipasi dalam voting','Suara komunitas telah dicatat.',
    jsonb_build_object('source_id',p_poll_id::text||':'||member_id::text,'poll_id',p_poll_id)
  );
  insert into public.caleris_member_badges(member_id,badge_code,source_type,source_id)
  values(member_id,'community_voice','community_vote',p_poll_id::text)
  on conflict do nothing;
end;
$cast_vote$;

create or replace function public.caleris_get_community_poll_results(p_poll_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $poll_results$
declare poll public.caleris_community_polls%rowtype; payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id;
  if not found then raise exception 'poll_not_found'; end if;
  if poll.status not in('closed','published') and poll.ends_at>now() then raise exception 'poll_results_not_available'; end if;
  select jsonb_build_object(
    'poll_id',poll.id,
    'status',case when poll.status='open' and poll.ends_at<=now() then 'ended_pending_finalization' else poll.status end,
    'total_votes',(select count(*) from public.caleris_community_votes v where v.poll_id=poll.id),
    'options',coalesce((
      select jsonb_agg(jsonb_build_object(
        'option_id',counts.id,'label',counts.label,'votes',counts.vote_count
      ) order by counts.vote_count desc,counts.label)
      from (
        select o.id,o.label,count(v.id)::integer as vote_count
        from public.caleris_community_poll_options o
        left join public.caleris_community_votes v on v.option_id=o.id
        where o.poll_id=poll.id
        group by o.id,o.label
      ) counts
    ),'[]'::jsonb)
  ) into payload;
  return payload;
end;
$poll_results$;

create or replace function public.caleris_admin_finalize_poll(p_poll_id uuid,p_publish boolean default false)
returns jsonb language plpgsql security definer set search_path=public
as $finalize_poll$
declare poll public.caleris_community_polls%rowtype;
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id for update;
  if not found or poll.status='draft' then raise exception 'poll_not_found_or_not_open'; end if;
  update public.caleris_community_polls
  set status=case when coalesce(p_publish,false) then 'published' else 'closed' end
  where id=p_poll_id;
  return public.caleris_get_community_poll_results(p_poll_id);
end;
$finalize_poll$;

-- Generate a trusted yearbook snapshot server-side. Client-supplied JSON is deliberately ignored.
create or replace function public.caleris_generate_yearbook(p_season uuid,p_title text default null)
returns jsonb language plpgsql security definer set search_path=public
as $generate_yearbook$
declare member_id uuid; member_row public.members%rowtype; total_xp numeric; official jsonb; snapshot jsonb; team_name text;
begin
  member_id:=public.caleris_current_member_id();
  if auth.uid() is null or member_id is null then raise exception 'member_profile_required'; end if;
  select * into member_row from public.members where id=member_id;
  if not found then raise exception 'member_not_found'; end if;
  official:=public.caleris_get_season_community_data(p_season);
  if official->'season' is null or official->'season'='null'::jsonb then raise exception 'season_not_found'; end if;
  select coalesce(sum(amount),0) into total_xp from public.caleris_xp_ledger where caleris_xp_ledger.member_id=member_id;
  select name into team_name from public.teams where id=member_row.team_id;
  snapshot:=jsonb_build_object(
    'snapshot_version',2,
    'generated_at',now(),
    'season',official->'season',
    'official_season_data',official,
    'member',jsonb_build_object(
      'member_code',member_row.member_code,
      'character_name',member_row.character_name,
      'role',member_row.role,
      'license',member_row.license,
      'team_name',team_name
    ),
    'xp',total_xp,
    'level',public.caleris_xp_level(total_xp),
    'badges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',b.code,'title',b.title,'description',b.description,'icon',b.icon,'rarity',b.rarity,'awarded_at',mb.awarded_at
      ) order by mb.awarded_at)
      from public.caleris_member_badges mb
      join public.caleris_achievement_badges b on b.code=mb.badge_code
      where mb.member_id=member_id
    ),'[]'::jsonb),
    'activity',coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select f.title,f.body,f.event_type,f.created_at
        from public.caleris_activity_feed f
        where f.visibility='community'
          or f.actor_member_id=member_id
          or (f.visibility='team' and f.team_id=member_row.team_id)
        order by f.created_at desc limit 50
      ) recent
    ),'[]'::jsonb)
  );
  insert into public.caleris_season_yearbooks(season_id,member_id,title,content,status,generated_by)
  values(p_season,member_id,left(coalesce(nullif(trim(p_title),''),(official->'season'->>'title')||' Yearbook'),160),snapshot,'draft',auth.uid())
  on conflict(member_id,season_id) do update
    set title=excluded.title,content=excluded.content,status='draft',generated_at=now(),generated_by=auth.uid();
  return snapshot;
end;
$generate_yearbook$;

create or replace function public.caleris_save_yearbook(p_season uuid,p_title text,p_content jsonb)
returns void language plpgsql security definer set search_path=public
as $legacy_yearbook$
begin
  perform public.caleris_generate_yearbook(p_season,p_title);
end;
$legacy_yearbook$;

-- A public verification endpoint exposes only the fields intentionally included in Digital ID.
create or replace function public.caleris_get_public_digital_id(p_member_code text)
returns jsonb language sql stable security definer set search_path=public
as $public_id$
  select jsonb_build_object(
    'card',jsonb_build_object(
      'theme',card.theme,'accent_color',card.accent_color,'tagline',card.tagline,'updated_at',card.updated_at
    ),
    'member',jsonb_build_object(
      'member_code',m.member_code,'character_name',m.character_name,'role',m.role,
      'license',m.license,'team_name',team.name
    ),
    'badges',coalesce((
      select jsonb_agg(jsonb_build_object('code',b.code,'title',b.title,'description',b.description,'icon',b.icon,'rarity',b.rarity,'awarded_at',mb.awarded_at) order by mb.awarded_at)
      from public.caleris_member_badges mb
      join public.caleris_achievement_badges b on b.code=mb.badge_code and b.active=true
      where mb.member_id=m.id
    ),'[]'::jsonb)
  )
  from public.members m
  join public.caleris_digital_id_cards card on card.member_id=m.id and card.public_visible=true
  left join public.teams team on team.id=m.team_id
  where upper(m.member_code)=upper(trim(p_member_code))
  limit 1;
$public_id$;

-- Official predictor standings only include completed rounds. Scheduled rounds remain available for simulation.
create or replace function public.caleris_get_season_community_data(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $season_data$
declare payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'season',(select to_jsonb(s) from public.license_seasons s where s.id=p_season),
    'divisions',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from public.license_season_divisions d where d.season_id=p_season),
    'current_driver_standings',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'season_division_id',d.id,'division_name',d.division_name,'member_id',rs.member_id,
        'driver_name_snapshot',max(rs.driver_name_snapshot),'team_id_snapshot',max(rs.team_id_snapshot),
        'team_name_snapshot',max(rs.team_name_snapshot),'final_points',sum(rs.points_total)
      ) order by sum(rs.points_total) desc),'[]'::jsonb)
      from public.license_round_standings rs
      join public.license_rounds r on r.id=rs.round_id
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
        and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
      group by d.id,d.division_name,rs.member_id
    ),
    'driver_standings',(
      select coalesce(jsonb_agg(to_jsonb(fs)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_final_standings fs
      join public.license_season_divisions d on d.id=fs.season_division_id
      where d.season_id=p_season
    ),
    'team_standings',(
      select coalesce(jsonb_agg(to_jsonb(ts)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_team_final_standings ts
      join public.license_season_divisions d on d.id=ts.season_division_id
      where d.season_id=p_season
    ),
    'rounds',(
      select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_rounds r
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
    ),
    'race_results',(
      select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('round_number',r.round_number,'division_name',d.division_name)),'[]'::jsonb)
      from public.caleris_race_result_entries e
      join public.license_rounds r on r.id=e.round_id
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
        and lower(coalesce(r.race_lifecycle_status,r.status,''))='completed'
    ),
    'scoring_rules',(
      select coalesce(jsonb_agg(to_jsonb(pr)),'[]'::jsonb)
      from public.caleris_race_points_rules pr where pr.is_active
    )
  ) into payload;
  if payload->'season' is null or payload->'season'='null'::jsonb then raise exception 'season_not_found'; end if;
  return coalesce(payload,'{}'::jsonb);
end;
$season_data$;

-- Existing hard-coded Team XP milestones are not backed by a Team XP ledger.
update public.caleris_milestone_definitions
set active=false
where scope='team' and metric_key='team_xp';

-- Only reset untouched seed rewards. Existing awarded history is preserved.
update public.caleris_milestone_definitions d
set xp_reward=0
where d.code in('driver_xp_50','driver_xp_100','driver_xp_200','driver_xp_400','driver_xp_800','driver_xp_1600','driver_xp_3200','driver_xp_6400')
  and not exists(
    select 1 from public.caleris_xp_ledger ledger
    where ledger.member_id in(select id from public.members)
      and ledger.source_type='milestone' and ledger.source_id=d.code
  );

-- Replace public vote, badge and Digital ID reads with the privacy rules above.
revoke all on function public.caleris_cast_community_vote(uuid,uuid) from public,anon;
grant execute on function public.caleris_cast_community_vote(uuid,uuid) to authenticated;
revoke all on function public.caleris_save_digital_id(text,text,text,boolean) from public,anon;
grant execute on function public.caleris_save_digital_id(text,text,text,boolean) to authenticated;
revoke all on function public.caleris_admin_create_poll(text,text,text,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.caleris_admin_create_poll(text,text,text,timestamptz,jsonb,uuid) to authenticated;
revoke all on function public.caleris_save_yearbook(uuid,text,jsonb) from public,anon;
grant execute on function public.caleris_save_yearbook(uuid,text,jsonb) to authenticated;
revoke all on function public.caleris_set_xp_reward(text,integer) from public,anon;
grant execute on function public.caleris_set_xp_reward(text,integer) to authenticated;
revoke all on function public.caleris_get_season_community_data(uuid) from public,anon;
grant execute on function public.caleris_get_season_community_data(uuid) to authenticated;
revoke all on function public.caleris_generate_yearbook(uuid,text) from public,anon;
grant execute on function public.caleris_generate_yearbook(uuid,text) to authenticated;
revoke all on function public.caleris_get_community_dashboard() from public,anon;
grant execute on function public.caleris_get_community_dashboard() to authenticated;
revoke all on function public.caleris_admin_save_milestone(text,text,text,text,text,numeric,integer,text,boolean) from public,anon;
grant execute on function public.caleris_admin_save_milestone(text,text,text,text,text,numeric,integer,text,boolean) to authenticated;
revoke all on function public.caleris_admin_adjust_xp(uuid,integer,text,text) from public,anon;
grant execute on function public.caleris_admin_adjust_xp(uuid,integer,text,text) to authenticated;
revoke all on function public.caleris_get_community_poll_results(uuid) from public,anon;
grant execute on function public.caleris_get_community_poll_results(uuid) to authenticated;
revoke all on function public.caleris_admin_finalize_poll(uuid,boolean) from public,anon;
grant execute on function public.caleris_admin_finalize_poll(uuid,boolean) to authenticated;
revoke all on function public.caleris_get_public_digital_id(text) from public;
grant execute on function public.caleris_get_public_digital_id(text) to anon,authenticated;

-- Backfill career and roster milestones without touching wallets or competition records.
do $backfill$
declare item record;
begin
  for item in select id from public.members loop
    perform public.caleris_refresh_driver_milestones(item.id);
  end loop;
  for item in select id from public.teams loop
    perform public.caleris_refresh_team_milestones(item.id);
  end loop;
end;
$backfill$;

commit;
