begin;

-- One authoritative reconciliation path for Driver and Team milestone progress.
create or replace function public.caleris_refresh_driver_milestones(p_member uuid)
returns void
language plpgsql security definer set search_path=public
as $driver_milestones$
declare
  d record;
  metric_value numeric;
  total_xp numeric;
  previous_completed_at timestamptz;
  current_completed_at timestamptz;
  completion_source text;
  award record;
  net_awarded integer;
  legacy_award_net integer;
  legacy_badge_exists boolean;
  inserted integer;
begin
  if p_member is null or not exists(select 1 from public.members where id=p_member) then return; end if;
  select coalesce(sum(amount),0) into total_xp
  from public.caleris_xp_ledger where member_id=p_member;

  for d in select * from public.caleris_milestone_definitions where scope='driver' order by metric_key,target_value,code
  loop
    select completed_at into previous_completed_at
    from public.caleris_milestone_progress
    where milestone_id=d.id and member_id=p_member;

    if not d.active then
      metric_value:=0;
    else
      metric_value:=case d.metric_key
        when 'xp_total' then total_xp
        when 'driver_race_starts' then (
          select count(distinct e.round_id)::numeric
          from public.caleris_race_result_entries e
          join public.license_rounds r on r.id=e.round_id
          where e.member_id=p_member
            and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
        )
        when 'driver_wins' then (
          select count(*)::numeric
          from public.caleris_race_result_entries e
          join public.license_rounds r on r.id=e.round_id
          where e.member_id=p_member and e.finishing_position=1
            and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
        )
        when 'driver_podiums' then (
          select count(*)::numeric
          from public.caleris_race_result_entries e
          join public.license_rounds r on r.id=e.round_id
          where e.member_id=p_member and e.finishing_position between 1 and 3
            and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
        )
        when 'driver_points' then (
          select coalesce(sum(rs.points_total),0)::numeric
          from public.license_round_standings rs
          join public.license_rounds r on r.id=rs.round_id
          where rs.member_id=p_member
            and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
        )
        when 'driver_championships' then (
          select count(distinct sd.season_id)::numeric
          from public.license_final_standings fs
          join public.license_season_divisions sd on sd.id=fs.season_division_id
          where fs.member_id=p_member and fs.final_position=1
        )
        else null
      end;
    end if;
    if metric_value is null then continue; end if;

    insert into public.caleris_milestone_progress(milestone_id,scope,member_id,current_value,completed_at)
    values(d.id,'driver',p_member,metric_value,case when metric_value>=d.target_value then now() end)
    on conflict(milestone_id,member_id) do update
      set current_value=excluded.current_value,
          completed_at=case
            when excluded.current_value>=d.target_value
              then coalesce(caleris_milestone_progress.completed_at,excluded.completed_at)
            else null
          end,
          updated_at=now();

    select completed_at into current_completed_at
    from public.caleris_milestone_progress
    where milestone_id=d.id and member_id=p_member;

    if current_completed_at is not null then
      select coalesce(sum(amount),0)::integer into legacy_award_net
      from public.caleris_xp_ledger
      where member_id=p_member and (
        (source_type='milestone' and source_id=d.code)
        or (source_type='admin_adjustment' and source_id='milestone_reversal:'||d.code)
      );
      select exists(
        select 1 from public.caleris_member_badges
        where member_id=p_member and source_type='milestone' and source_id=d.code
      ) into legacy_badge_exists;
      if previous_completed_at is not null or legacy_award_net>0 or legacy_badge_exists then
        completion_source:=d.code;
      else
        completion_source:=d.code||':'||p_member::text||':'||
          to_char(current_completed_at at time zone 'UTC','YYYYMMDDHH24MISSUS');
      end if;

      delete from public.caleris_member_badges
      where member_id=p_member and source_type='milestone'
        and source_id=completion_source
        and badge_code is distinct from d.badge_code;

      if d.badge_code is not null and exists(
        select 1 from public.caleris_achievement_badges
        where code=d.badge_code and active=true
      ) then
        insert into public.caleris_member_badges(member_id,badge_code,source_type,source_id)
        values(p_member,d.badge_code,'milestone',completion_source)
        on conflict do nothing;
      end if;

      if coalesce(d.xp_reward,0)>0 then
        insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
        values(p_member,d.xp_reward,'milestone',completion_source,'Milestone reward: '||d.title)
        on conflict(member_id,source_type,source_id) do nothing;
        get diagnostics inserted = row_count;
        if inserted=1 then total_xp:=total_xp+d.xp_reward; end if;
      end if;

      if previous_completed_at is null then
        perform public.caleris_log_activity(
          p_member,null,'milestone_completed','Milestone tercapai',d.title,
          jsonb_build_object('source_id','milestone:'||completion_source,'metric_key',d.metric_key,'target',d.target_value)
        );
      end if;
    elsif previous_completed_at is not null then
      completion_source:=d.code||':'||p_member::text||':'||
        to_char(previous_completed_at at time zone 'UTC','YYYYMMDDHH24MISSUS');

      for award in
        select source_id from public.caleris_xp_ledger
        where member_id=p_member and source_type='milestone' and source_id=completion_source
      loop
        select coalesce(sum(amount),0)::integer into net_awarded
        from public.caleris_xp_ledger
        where member_id=p_member and (
          (source_type='milestone' and source_id=award.source_id)
          or (source_type='admin_adjustment' and source_id='milestone_reversal:'||award.source_id)
        );
        if net_awarded>0 then
          insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
          values(p_member,-net_awarded,'admin_adjustment','milestone_reversal:'||award.source_id,
            'Reversal: milestone no longer met after official data reconciliation')
          on conflict(member_id,source_type,source_id) do nothing;
          total_xp:=total_xp-net_awarded;
        end if;
      end loop;

      delete from public.caleris_member_badges
      where member_id=p_member and source_type='milestone' and source_id=completion_source;

      perform public.caleris_log_activity(
        p_member,null,'milestone_reversed','Milestone diperbarui',d.title,
        jsonb_build_object('source_id','milestone_reversed:'||completion_source,'metric_key',d.metric_key,'current_value',metric_value)
      );
    end if;
  end loop;
end;
$driver_milestones$;

create or replace function public.caleris_refresh_team_milestones(p_team uuid)
returns void
language plpgsql security definer set search_path=public
as $team_milestones$
declare d record; metric_value numeric;
begin
  if p_team is null then return; end if;
  for d in select * from public.caleris_milestone_definitions where scope='team'
  loop
    if not d.active then
      metric_value:=0;
    else
      metric_value:=case d.metric_key
        when 'team_races' then (
          select count(distinct e.round_id)::numeric
          from public.caleris_race_result_entries e
          join public.license_rounds r on r.id=e.round_id
          where e.team_id=p_team
            and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
        )
        when 'team_wins' then (
          select count(*)::numeric
          from public.caleris_race_result_entries e
          join public.license_rounds r on r.id=e.round_id
          where e.team_id=p_team and e.finishing_position=1
            and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
        )
        when 'team_podiums' then (
          select count(*)::numeric
          from public.caleris_race_result_entries e
          join public.license_rounds r on r.id=e.round_id
          where e.team_id=p_team and e.finishing_position between 1 and 3
            and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
        )
        when 'team_drivers' then (
          select count(*)::numeric from public.members m where m.team_id=p_team and m.role='Driver'
        )
        when 'team_xp' then (
          select coalesce(sum(x.amount),0)::numeric
          from public.caleris_xp_ledger x
          join public.members m on m.id=x.member_id
          where m.team_id=p_team and m.role='Driver'
        )
        when 'team_championships' then (
          select count(distinct sd.season_id)::numeric
          from public.license_team_final_standings fs
          join public.license_season_divisions sd on sd.id=fs.season_division_id
          where fs.team_id=p_team and fs.final_position=1
        )
        else null
      end;
    end if;
    if metric_value is null then continue; end if;
    insert into public.caleris_milestone_progress(milestone_id,scope,team_id,current_value,completed_at)
    values(d.id,'team',p_team,metric_value,case when metric_value>=d.target_value then now() end)
    on conflict(milestone_id,team_id) do update
      set current_value=excluded.current_value,
          completed_at=case
            when excluded.current_value>=d.target_value
              then coalesce(caleris_milestone_progress.completed_at,excluded.completed_at)
            else null
          end,
          updated_at=now();
  end loop;
end;
$team_milestones$;

create or replace function public.caleris_sync_xp_milestones()
returns trigger
language plpgsql security definer set search_path=public
as $xp_sync$
begin
  if current_setting('caleris.xp_milestone_sync',true)='on' then return new; end if;
  perform set_config('caleris.xp_milestone_sync','on',true);
  perform public.caleris_refresh_driver_milestones(new.member_id);
  perform set_config('caleris.xp_milestone_sync','off',true);
  return new;
end;
$xp_sync$;

create or replace function public.caleris_reverse_round_entry_xp(
  p_round_id uuid,p_entry_id uuid,p_member_id uuid,p_team_id uuid,p_reason text default 'round_void'
)
returns void
language plpgsql security definer set search_path=public
as $reverse_round_xp$
declare net_awarded integer; reversal_source text;
begin
  if p_member_id is null then return; end if;
  select coalesce(sum(amount),0)::integer into net_awarded
  from public.caleris_xp_ledger
  where member_id=p_member_id and (
    (source_type='race_result' and (
      source_id=p_entry_id::text or source_id like p_entry_id::text||':%'
    ))
    or (source_type='admin_adjustment' and (
      source_id like 'race_result_reversal:'||p_entry_id::text||':'||p_member_id::text||':%'
      or source_id like 'round_void_reversal:'||p_round_id::text||':'||p_entry_id::text||':'||p_member_id::text||':%'
    ))
  );
  if net_awarded<=0 then return; end if;
  if p_reason='entry_removed' then
    reversal_source:='race_result_reversal:'||p_entry_id::text||':'||p_member_id::text||':'||gen_random_uuid()::text;
  else
    reversal_source:='round_void_reversal:'||p_round_id::text||':'||p_entry_id::text||':'||p_member_id::text||':'||gen_random_uuid()::text;
  end if;
  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
  values(p_member_id,-net_awarded,'admin_adjustment',reversal_source,
    'Reversal: official race result removed, reassigned, or voided')
  on conflict(member_id,source_type,source_id) do nothing;
  perform public.caleris_log_activity(
    p_member_id,p_team_id,'xp_adjustment','Koreksi XP',
    'XP partisipasi dikoreksi mengikuti status hasil kompetisi resmi.',
    jsonb_build_object('source_id',reversal_source,'round_id',p_round_id,'entry_id',p_entry_id,'reason',p_reason)
  );
end;
$reverse_round_xp$;

create or replace function public.caleris_reverse_race_entry_xp()
returns trigger
language plpgsql security definer set search_path=public
as $reverse_entry_xp$
declare round_is_official boolean;
begin
  if tg_op='DELETE' then
    perform public.caleris_reverse_round_entry_xp(old.round_id,old.id,old.member_id,old.team_id,'entry_removed');
    return old;
  end if;

  if old.member_id is distinct from new.member_id then
    perform public.caleris_reverse_round_entry_xp(old.round_id,old.id,old.member_id,old.team_id,'entry_removed');
    select exists(
      select 1 from public.license_rounds r
      where r.id=new.round_id
        and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
    ) into round_is_official;
    if round_is_official and new.member_id is not null then
      perform public.caleris_award_configured_xp(
        new.member_id,'race_result',
        new.id::text||':member-change:'||gen_random_uuid()::text,
        'Official race result participation'
      );
    end if;
  end if;
  return new;
end;
$reverse_entry_xp$;

create or replace function public.caleris_xp_race_entry_trigger()
returns trigger
language plpgsql security definer set search_path=public
as $race_xp$
begin
  if new.member_id is not null and exists(
    select 1 from public.license_rounds r
    where r.id=new.round_id
      and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
  ) then
    perform public.caleris_award_configured_xp(new.member_id,'race_result',new.id::text,'Race result participation');
  end if;
  return new;
end;
$race_xp$;

create or replace function public.caleris_team_result_milestone_trigger()
returns trigger
language plpgsql security definer set search_path=public
as $team_result_trigger$
declare official boolean;
begin
  if tg_op='DELETE' then
    perform public.caleris_refresh_team_milestones(old.team_id);
    perform public.caleris_refresh_driver_milestones(old.member_id);
    return old;
  end if;
  if tg_op='UPDATE' then
    if old.team_id is distinct from new.team_id or old.round_id is distinct from new.round_id then
      perform public.caleris_refresh_team_milestones(old.team_id);
    end if;
    if old.member_id is distinct from new.member_id or old.round_id is distinct from new.round_id then
      perform public.caleris_refresh_driver_milestones(old.member_id);
    end if;
  end if;
  perform public.caleris_refresh_team_milestones(new.team_id);
  perform public.caleris_refresh_driver_milestones(new.member_id);

  select exists(
    select 1 from public.license_rounds r
    where r.id=new.round_id
      and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
  ) into official;
  if tg_op='INSERT' and official then
    perform public.caleris_log_activity(
      new.member_id,new.team_id,'race_result','Hasil balapan tercatat',
      coalesce(new.driver_name_snapshot,'Driver')||' menyelesaikan ronde dengan posisi '||coalesce(new.finishing_position::text,'-'),
      jsonb_build_object('source_id',new.id::text,'round_id',new.round_id,'position',new.finishing_position)
    );
  end if;
  return new;
end;
$team_result_trigger$;

create or replace function public.caleris_round_community_progression_trigger()
returns trigger
language plpgsql security definer set search_path=public
as $round_progression$
declare
  old_official boolean;
  new_official boolean;
  entry record;
  award_source text;
begin
  old_official:=lower(coalesce(old.race_lifecycle_status,old.status,'')) in('completed','closed');
  new_official:=lower(coalesce(new.race_lifecycle_status,new.status,'')) in('completed','closed');

  for entry in
    select id,member_id,team_id,driver_name_snapshot,finishing_position
    from public.caleris_race_result_entries where round_id=new.id
  loop
    if old_official and not new_official then
      perform public.caleris_reverse_round_entry_xp(new.id,entry.id,entry.member_id,entry.team_id,'round_void');
      perform public.caleris_log_activity(
        entry.member_id,entry.team_id,'race_result_voided','Hasil balapan dibatalkan',
        coalesce(entry.driver_name_snapshot,'Driver')||' tidak lagi dihitung dalam hasil resmi.',
        jsonb_build_object('source_id','round-void:'||new.id::text||':'||entry.id::text,'round_id',new.id)
      );
    elsif not old_official and new_official and entry.member_id is not null then
      if exists(
        select 1 from public.caleris_xp_ledger
        where member_id=entry.member_id and source_type='race_result' and source_id=entry.id::text
      ) then
        award_source:=entry.id::text||':round-reopen:'||gen_random_uuid()::text;
      else
        award_source:=entry.id::text;
      end if;
      perform public.caleris_award_configured_xp(
        entry.member_id,'race_result',award_source,'Official race result participation'
      );
      perform public.caleris_log_activity(
        entry.member_id,entry.team_id,'race_result','Hasil balapan tercatat',
        coalesce(entry.driver_name_snapshot,'Driver')||' menyelesaikan ronde dengan posisi '||coalesce(entry.finishing_position::text,'-'),
        jsonb_build_object('source_id',entry.id::text,'round_id',new.id,'position',entry.finishing_position)
      );
    end if;
    perform public.caleris_refresh_team_milestones(entry.team_id);
    perform public.caleris_refresh_driver_milestones(entry.member_id);
  end loop;
  return new;
end;
$round_progression$;

drop trigger if exists caleris_round_community_progression_sync on public.license_rounds;
create trigger caleris_round_community_progression_sync
after update of status,race_lifecycle_status on public.license_rounds
for each row execute function public.caleris_round_community_progression_trigger();

-- Career title counts use finalized official standings. Pole counts are intentionally not inferred from grid_position.
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
      'race_starts',(select count(distinct e.round_id) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')),
      'wins',(select count(*) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and e.finishing_position=1 and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')),
      'podiums',(select count(*) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and e.finishing_position between 1 and 3 and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')),
      'points',(select coalesce(sum(rs.points_total),0) from public.license_round_standings rs join public.license_rounds r on r.id=rs.round_id where rs.member_id=member_id and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')),
      'championships',(select count(distinct sd.season_id) from public.license_final_standings fs join public.license_season_divisions sd on sd.id=fs.season_division_id where fs.member_id=member_id and fs.final_position=1)
    ),
    'team_id',team,
    'team_stats',case when team is null then null else jsonb_build_object(
      'race_starts',(select count(distinct e.round_id) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.team_id=team and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')),
      'wins',(select count(*) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.team_id=team and e.finishing_position=1 and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')),
      'podiums',(select count(*) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.team_id=team and e.finishing_position between 1 and 3 and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')),
      'championships',(select count(distinct sd.season_id) from public.license_team_final_standings fs join public.license_season_divisions sd on sd.id=fs.season_division_id where fs.team_id=team and fs.final_position=1),
      'drivers',(select count(*) from public.members m where m.team_id=team and m.role='Driver')
    ) end
  ) into payload;
  return payload;
end;
$dashboard$;

insert into public.caleris_milestone_definitions(scope,code,title,description,metric_key,target_value,xp_reward,active)
values
('driver','career_race_starts_1','First Race Start','Complete your first official race start.','driver_race_starts',1,0,true),
('driver','career_race_starts_10','Ten Race Starts','Complete ten official race starts.','driver_race_starts',10,0,true),
('driver','career_race_starts_25','Twenty-Five Race Starts','Complete twenty-five official race starts.','driver_race_starts',25,0,true),
('driver','career_first_win','First Victory','Win an official race.','driver_wins',1,0,true),
('driver','career_five_wins','Five Victories','Win five official races.','driver_wins',5,0,true),
('driver','career_first_podium','First Podium','Achieve an official top-three finish.','driver_podiums',1,0,true),
('driver','career_ten_podiums','Ten Podiums','Achieve ten official top-three finishes.','driver_podiums',10,0,true),
('driver','career_100_points','Century Club','Score 100 official championship points.','driver_points',100,0,true),
('driver','career_500_points','500 Points Club','Score 500 official championship points.','driver_points',500,0,true),
('driver','career_first_title','Season Champion','Win an official season division championship.','driver_championships',1,0,true),
('team','team_first_title','Team Champion','Win an official team season division championship.','team_championships',1,0,true),
('team','team_first_win','First Team Victory','Record an official team race victory.','team_wins',1,0,true),
('team','team_first_podium','First Team Podium','Record an official team podium.','team_podiums',1,0,true)
on conflict(code) do nothing;

-- Reconcile all existing official history once; this does not create fake competition records.
do $backfill$
declare m record; t record;
begin
  for m in select id from public.members loop
    perform public.caleris_refresh_driver_milestones(m.id);
  end loop;
  for t in
    select team_id from public.members where team_id is not null
    union
    select distinct team_id from public.caleris_race_result_entries where team_id is not null
  loop
    perform public.caleris_refresh_team_milestones(t.team_id);
  end loop;
end;
$backfill$;

revoke all on function public.caleris_reverse_round_entry_xp(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.caleris_reverse_race_entry_xp() from public,anon,authenticated;
revoke all on function public.caleris_xp_race_entry_trigger() from public,anon,authenticated;
revoke all on function public.caleris_team_result_milestone_trigger() from public,anon,authenticated;
revoke all on function public.caleris_round_community_progression_trigger() from public,anon,authenticated;
revoke all on function public.caleris_refresh_driver_milestones(uuid) from public,anon,authenticated;
revoke all on function public.caleris_refresh_team_milestones(uuid) from public,anon,authenticated;
revoke all on function public.caleris_sync_xp_milestones() from public,anon,authenticated;
revoke all on function public.caleris_get_community_dashboard() from public,anon;
grant execute on function public.caleris_get_community_dashboard() to authenticated;

commit;
