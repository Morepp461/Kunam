begin;

create or replace function public.caleris_get_community_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_member_id uuid;
  v_team_id uuid;
  v_total_xp numeric;
  v_payload jsonb;
begin
  v_member_id := public.caleris_current_member_id();
  if auth.uid() is null or v_member_id is null then
    raise exception 'member_profile_required';
  end if;

  select m.team_id into v_team_id
  from public.members as m
  where m.id = v_member_id;

  select coalesce(sum(x.amount), 0) into v_total_xp
  from public.caleris_xp_ledger as x
  where x.member_id = v_member_id;

  select jsonb_build_object(
    'member_id', v_member_id,
    'total_xp', v_total_xp,
    'level', public.caleris_xp_level(v_total_xp),
    'driver_stats', jsonb_build_object(
      'race_starts', (
        select count(distinct e.round_id)
        from public.caleris_race_result_entries as e
        join public.license_rounds as r on r.id = e.round_id
        where e.member_id = v_member_id
          and lower(coalesce(r.race_lifecycle_status, r.status, '')) in ('completed', 'closed')
      ),
      'wins', (
        select count(*)
        from public.caleris_race_result_entries as e
        join public.license_rounds as r on r.id = e.round_id
        where e.member_id = v_member_id
          and e.finishing_position = 1
          and lower(coalesce(r.race_lifecycle_status, r.status, '')) in ('completed', 'closed')
      ),
      'podiums', (
        select count(*)
        from public.caleris_race_result_entries as e
        join public.license_rounds as r on r.id = e.round_id
        where e.member_id = v_member_id
          and e.finishing_position between 1 and 3
          and lower(coalesce(r.race_lifecycle_status, r.status, '')) in ('completed', 'closed')
      ),
      'points', (
        select coalesce(sum(rs.points_total), 0)
        from public.license_round_standings as rs
        join public.license_rounds as r on r.id = rs.round_id
        where rs.member_id = v_member_id
          and lower(coalesce(r.race_lifecycle_status, r.status, '')) in ('completed', 'closed')
      ),
      'championships', (
        select count(distinct sd.season_id)
        from public.license_final_standings as fs
        join public.license_season_divisions as sd on sd.id = fs.season_division_id
        where fs.member_id = v_member_id
          and fs.final_position = 1
      )
    ),
    'team_id', v_team_id,
    'team_stats', case when v_team_id is null then null else jsonb_build_object(
      'race_starts', (
        select count(distinct e.round_id)
        from public.caleris_race_result_entries as e
        join public.license_rounds as r on r.id = e.round_id
        where e.team_id = v_team_id
          and lower(coalesce(r.race_lifecycle_status, r.status, '')) in ('completed', 'closed')
      ),
      'wins', (
        select count(*)
        from public.caleris_race_result_entries as e
        join public.license_rounds as r on r.id = e.round_id
        where e.team_id = v_team_id
          and e.finishing_position = 1
          and lower(coalesce(r.race_lifecycle_status, r.status, '')) in ('completed', 'closed')
      ),
      'podiums', (
        select count(*)
        from public.caleris_race_result_entries as e
        join public.license_rounds as r on r.id = e.round_id
        where e.team_id = v_team_id
          and e.finishing_position between 1 and 3
          and lower(coalesce(r.race_lifecycle_status, r.status, '')) in ('completed', 'closed')
      ),
      'championships', (
        select count(distinct sd.season_id)
        from public.license_team_final_standings as fs
        join public.license_season_divisions as sd on sd.id = fs.season_division_id
        where fs.team_id = v_team_id
          and fs.final_position = 1
      ),
      'drivers', (
        select count(*)
        from public.members as m
        where m.team_id = v_team_id and m.role = 'Driver'
      )
    ) end
  ) into v_payload;

  return v_payload;
end;
$function$;

create or replace function public.caleris_generate_yearbook(p_season uuid, p_title text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_member_id uuid;
  v_member_row public.members%rowtype;
  v_total_xp numeric;
  v_official jsonb;
  v_snapshot jsonb;
  v_team_name text;
  v_season_member_name text;
begin
  v_member_id := public.caleris_current_member_id();
  if auth.uid() is null or v_member_id is null then
    raise exception 'member_profile_required';
  end if;

  select * into v_member_row
  from public.members as m
  where m.id = v_member_id;
  if not found then
    raise exception 'member_not_found';
  end if;

  v_official := public.caleris_get_season_community_data(p_season);
  if v_official->'season' is null or v_official->'season' = 'null'::jsonb then
    raise exception 'season_not_found';
  end if;

  select fs.driver_name_snapshot, fs.team_name_snapshot
  into v_season_member_name, v_team_name
  from public.license_final_standings as fs
  join public.license_season_divisions as sd on sd.id = fs.season_division_id
  where fs.member_id = v_member_id
    and sd.season_id = p_season
  order by fs.updated_at desc, fs.final_position asc
  limit 1;

  v_team_name := coalesce(
    v_team_name,
    (select t.name from public.teams as t where t.id = v_member_row.team_id)
  );
  v_season_member_name := coalesce(v_season_member_name, v_member_row.character_name);

  select coalesce(sum(x.amount), 0) into v_total_xp
  from public.caleris_xp_ledger as x
  where x.member_id = v_member_id;

  v_snapshot := jsonb_build_object(
    'snapshot_version', 2,
    'generated_at', now(),
    'season', v_official->'season',
    'official_season_data', v_official,
    'member', jsonb_build_object(
      'member_code', v_member_row.member_code,
      'character_name', v_season_member_name,
      'role', v_member_row.role,
      'license', v_member_row.license,
      'team_name', v_team_name
    ),
    'xp', v_total_xp,
    'level', public.caleris_xp_level(v_total_xp),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', earned.code,
        'title', earned.title,
        'description', earned.description,
        'icon', earned.icon,
        'rarity', earned.rarity,
        'awarded_at', earned.awarded_at
      ) order by earned.awarded_at)
      from (
        select distinct on (b.code)
          b.code, b.title, b.description, b.icon, b.rarity, mb.awarded_at
        from public.caleris_member_badges as mb
        join public.caleris_achievement_badges as b on b.code = mb.badge_code
        where mb.member_id = v_member_id
        order by b.code, mb.awarded_at asc
      ) as earned
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select f.title, f.body, f.event_type, f.created_at
        from public.caleris_activity_feed as f
        where f.visibility = 'community'
          or f.actor_member_id = v_member_id
          or (f.visibility = 'team' and f.team_id = v_member_row.team_id)
        order by f.created_at desc
        limit 50
      ) as recent
    ), '[]'::jsonb)
  );

  insert into public.caleris_season_yearbooks(
    season_id, member_id, title, content, status, generated_by
  )
  values (
    p_season,
    v_member_id,
    left(coalesce(nullif(trim(p_title), ''), (v_official->'season'->>'title') || ' Yearbook', 'Season Yearbook'), 160),
    v_snapshot,
    'draft',
    auth.uid()
  )
  on conflict (member_id, season_id) do update
    set title = excluded.title,
        content = excluded.content,
        status = 'draft',
        generated_at = now(),
        generated_by = auth.uid();

  return v_snapshot;
end;
$function$;

create or replace function public.caleris_cast_community_vote(p_poll_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_member_id uuid := public.caleris_current_member_id();
  v_poll public.caleris_community_polls%rowtype;
begin
  if auth.uid() is null or v_member_id is null then
    raise exception 'member_profile_required';
  end if;

  select * into v_poll
  from public.caleris_community_polls as p
  where p.id = p_poll_id
  for update;
  if not found then
    raise exception 'poll_not_open';
  end if;

  if v_poll.status = 'scheduled' and now() >= v_poll.starts_at and now() < v_poll.ends_at then
    update public.caleris_community_polls
    set status = 'open'
    where id = p_poll_id;
    v_poll.status := 'open';
  end if;

  if v_poll.status <> 'open' or now() < v_poll.starts_at or now() >= v_poll.ends_at then
    raise exception 'poll_not_open';
  end if;

  if not exists(
    select 1
    from public.caleris_community_poll_options as o
    where o.id = p_option_id and o.poll_id = p_poll_id
  ) then
    raise exception 'invalid_option';
  end if;

  insert into public.caleris_community_votes(poll_id, voter_member_id, option_id)
  values (p_poll_id, v_member_id, p_option_id);

  perform public.caleris_log_activity(
    v_member_id,
    (select m.team_id from public.members as m where m.id = v_member_id),
    'community_vote',
    'Member berpartisipasi dalam voting',
    'Suara komunitas telah dicatat.',
    jsonb_build_object('source_id', p_poll_id::text || ':' || v_member_id::text, 'poll_id', p_poll_id)
  );

  insert into public.caleris_member_badges(member_id, badge_code, source_type, source_id)
  values (v_member_id, 'community_voice', 'community_vote', p_poll_id::text)
  on conflict do nothing;
end;
$function$;

commit;
