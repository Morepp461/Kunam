begin;
create or replace function public.caleris_get_season_community_data(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $function$
declare v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'season',(select to_jsonb(s) from public.license_seasons as s where s.id=p_season),
    'divisions',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from public.license_season_divisions as d where d.season_id=p_season),
    'current_driver_standings',(
      select coalesce(jsonb_agg(to_jsonb(standing) order by standing.final_points desc),'[]'::jsonb)
      from (
        select d.id as season_division_id,
          d.division_name,
          rs.member_id,
          max(rs.driver_name_snapshot) as driver_name_snapshot,
          (array_agg(rs.team_id_snapshot order by r.round_number desc) filter (where rs.team_id_snapshot is not null))[1] as team_id_snapshot,
          max(rs.team_name_snapshot) as team_name_snapshot,
          sum(rs.points_total) as final_points
        from public.license_round_standings as rs
        join public.license_rounds as r on r.id=rs.round_id
        join public.license_season_divisions as d on d.id=r.season_division_id
        where d.season_id=p_season
          and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
        group by d.id,d.division_name,rs.member_id
      ) as standing
    ),
    'driver_standings',(
      select coalesce(jsonb_agg(to_jsonb(fs)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_final_standings as fs
      join public.license_season_divisions as d on d.id=fs.season_division_id where d.season_id=p_season
    ),
    'team_standings',(
      select coalesce(jsonb_agg(to_jsonb(ts)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_team_final_standings as ts
      join public.license_season_divisions as d on d.id=ts.season_division_id where d.season_id=p_season
    ),
    'rounds',(
      select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_rounds as r
      join public.license_season_divisions as d on d.id=r.season_division_id where d.season_id=p_season
    ),
    'race_results',(
      select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('round_number',r.round_number,'division_name',d.division_name)),'[]'::jsonb)
      from public.caleris_race_result_entries as e
      join public.license_rounds as r on r.id=e.round_id
      join public.license_season_divisions as d on d.id=r.season_division_id
      where d.season_id=p_season and lower(coalesce(r.race_lifecycle_status,r.status,'')) in('completed','closed')
    ),
    'scoring_rules',(
      select coalesce(jsonb_agg(to_jsonb(pr)),'[]'::jsonb)
      from public.caleris_race_points_rules as pr where pr.is_active
    )
  ) into v_payload;
  if v_payload->'season' is null or v_payload->'season'='null'::jsonb then raise exception 'season_not_found'; end if;
  return coalesce(v_payload,'{}'::jsonb);
end;
$function$;
commit;