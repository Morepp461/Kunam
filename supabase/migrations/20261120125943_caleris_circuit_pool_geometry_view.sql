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
  end as lap_record_driver_name,
  c.geometry_draft,
  c.source_provenance,
  c.geometry_status
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
  order by e.fastest_lap_ms, e.recorded_at, e.id
  limit 1
) race_record on true;
