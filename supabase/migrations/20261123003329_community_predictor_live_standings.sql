create or replace function public.caleris_get_season_community_data(p_season uuid)
returns jsonb
language plpgsql stable security definer set search_path=public
as $live_season$
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
   group by d.id,d.division_name,rs.member_id
  ),
  'driver_standings',(
   select coalesce(jsonb_agg(to_jsonb(fs)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
   from public.license_final_standings fs join public.license_season_divisions d on d.id=fs.season_division_id
   where d.season_id=p_season
  ),
  'team_standings',(
   select coalesce(jsonb_agg(to_jsonb(ts)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
   from public.license_team_final_standings ts join public.license_season_divisions d on d.id=ts.season_division_id
   where d.season_id=p_season
  ),
  'rounds',(
   select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
   from public.license_rounds r join public.license_season_divisions d on d.id=r.season_division_id
   where d.season_id=p_season
  ),
  'race_results',(
   select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('round_number',r.round_number,'division_name',d.division_name)),'[]'::jsonb)
   from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id
   join public.license_season_divisions d on d.id=r.season_division_id where d.season_id=p_season
  ),
  'scoring_rules',(select coalesce(jsonb_agg(to_jsonb(pr)),'[]'::jsonb) from public.caleris_race_points_rules pr where pr.is_active)
 ) into payload;
 return coalesce(payload,'{}'::jsonb);
end;
$live_season$;
revoke all on function public.caleris_get_season_community_data(uuid) from public,anon;
grant execute on function public.caleris_get_season_community_data(uuid) to authenticated;
