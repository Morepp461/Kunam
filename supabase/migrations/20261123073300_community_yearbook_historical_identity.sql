begin;

create or replace function public.caleris_generate_yearbook(p_season uuid,p_title text default null)
returns jsonb
language plpgsql security definer set search_path=public
as $yearbook$
declare
  member_id uuid;
  member_row public.members%rowtype;
  total_xp numeric;
  official jsonb;
  snapshot jsonb;
  team_name text;
  season_member_name text;
begin
  member_id:=public.caleris_current_member_id();
  if auth.uid() is null or member_id is null then raise exception 'member_profile_required'; end if;
  select * into member_row from public.members where id=member_id;
  if not found then raise exception 'member_not_found'; end if;
  official:=public.caleris_get_season_community_data(p_season);
  if official->'season' is null or official->'season'='null'::jsonb then raise exception 'season_not_found'; end if;

  select fs.driver_name_snapshot,fs.team_name_snapshot
  into season_member_name,team_name
  from public.license_final_standings fs
  join public.license_season_divisions sd on sd.id=fs.season_division_id
  where fs.member_id=member_id and sd.season_id=p_season
  order by fs.updated_at desc,fs.final_position asc
  limit 1;
  team_name:=coalesce(team_name,(select t.name from public.teams t where t.id=member_row.team_id));
  season_member_name:=coalesce(season_member_name,member_row.character_name);

  select coalesce(sum(amount),0) into total_xp
  from public.caleris_xp_ledger where caleris_xp_ledger.member_id=member_id;

  snapshot:=jsonb_build_object(
    'snapshot_version',2,
    'generated_at',now(),
    'season',official->'season',
    'official_season_data',official,
    'member',jsonb_build_object(
      'member_code',member_row.member_code,
      'character_name',season_member_name,
      'role',member_row.role,
      'license',member_row.license,
      'team_name',team_name
    ),
    'xp',total_xp,
    'level',public.caleris_xp_level(total_xp),
    'badges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',earned.code,'title',earned.title,'description',earned.description,
        'icon',earned.icon,'rarity',earned.rarity,'awarded_at',earned.awarded_at
      ) order by earned.awarded_at)
      from (
        select distinct on (b.code) b.code,b.title,b.description,b.icon,b.rarity,mb.awarded_at
        from public.caleris_member_badges mb
        join public.caleris_achievement_badges b on b.code=mb.badge_code
        where mb.member_id=member_id
        order by b.code,mb.awarded_at asc
      ) earned
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
  values(
    p_season,member_id,
    left(coalesce(nullif(trim(p_title),''),(official->'season'->>'title')||' Yearbook','Season Yearbook'),160),
    snapshot,'draft',auth.uid()
  )
  on conflict(member_id,season_id) do update
    set title=excluded.title,content=excluded.content,status='draft',generated_at=now(),generated_by=auth.uid();
  return snapshot;
end;
$yearbook$;

commit;
