begin;

CREATE OR REPLACE FUNCTION public.caleris_refresh_driver_milestones(p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      if legacy_award_net>0 or legacy_badge_exists then
        completion_source:=d.code;
      else
        completion_source:=d.code;
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

      if public.caleris_milestone_reward_xp(d.code)>0 then
        insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
        values(p_member,public.caleris_milestone_reward_xp(d.code),'milestone',completion_source,'Milestone reward: '||d.title)
        on conflict(member_id,source_type,source_id) do nothing;
        get diagnostics inserted = row_count;
        if inserted=1 then total_xp:=total_xp+public.caleris_milestone_reward_xp(d.code); end if;
      end if;

      if previous_completed_at is null then
        perform public.caleris_log_activity(
          p_member,null,'milestone_completed','Milestone tercapai',d.title,
          jsonb_build_object('source_id','milestone:'||completion_source,'metric_key',d.metric_key,'target',d.target_value)
        );
      end if;
    elsif previous_completed_at is not null then
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
      if legacy_award_net>0 or legacy_badge_exists then
        completion_source:=d.code;
      else
        completion_source:=d.code;
      end if;

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
        -- Milestone XP is permanent; only official race-result reconciliation can reverse race XP.
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
$function$;


commit;
