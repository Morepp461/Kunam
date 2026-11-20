begin;

alter table public.caleris_circuits
  add column if not exists circuit_geometry jsonb,
  add column if not exists geometry_revision integer not null default 0,
  add column if not exists circuit_kind text not null default 'fictional';

alter table public.caleris_circuits
  drop constraint if exists caleris_circuits_circuit_kind_check;
alter table public.caleris_circuits
  add constraint caleris_circuits_circuit_kind_check
  check (circuit_kind in ('fictional','real')) not valid;
alter table public.caleris_circuits
  validate constraint caleris_circuits_circuit_kind_check;

create table if not exists public.caleris_circuit_revisions (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid not null references public.caleris_circuits(id) on delete cascade,
  revision integer not null check (revision > 0),
  geometry jsonb not null check (jsonb_typeof(geometry) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (circuit_id, revision)
);

create index if not exists caleris_circuit_revisions_history_idx
  on public.caleris_circuit_revisions (circuit_id, revision desc);

alter table public.caleris_circuit_revisions enable row level security;

drop policy if exists "Authenticated users read circuit revisions" on public.caleris_circuit_revisions;
create policy "Authenticated users read circuit revisions"
  on public.caleris_circuit_revisions for select
  to authenticated using (true);

drop policy if exists "FIA and Admin insert circuit revisions" on public.caleris_circuit_revisions;
create policy "FIA and Admin insert circuit revisions"
  on public.caleris_circuit_revisions for insert
  to authenticated
  with check (public.is_caleris_fia_or_admin());

grant select, insert on public.caleris_circuit_revisions to authenticated;
revoke update, delete on public.caleris_circuit_revisions from authenticated;

create or replace function public.save_caleris_circuit_revision(
  p_circuit_id uuid,
  p_geometry jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revision integer;
begin
  if auth.uid() is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Circuit revision requires FIA or Admin authorization';
  end if;
  if p_geometry is null or jsonb_typeof(p_geometry) <> 'object' then
    raise exception 'Circuit geometry must be a JSON object';
  end if;

  select geometry_revision + 1
    into v_revision
    from public.caleris_circuits
    where id = p_circuit_id
    for update;

  if v_revision is null then
    raise exception 'Circuit not found';
  end if;

  update public.caleris_circuits
    set circuit_geometry = p_geometry,
        geometry_revision = v_revision,
        circuit_kind = coalesce(p_geometry->>'kind', circuit_kind),
        updated_at = now()
    where id = p_circuit_id;

  insert into public.caleris_circuit_revisions (circuit_id, revision, geometry, created_by)
    values (p_circuit_id, v_revision, p_geometry, auth.uid());

  return v_revision;
end;
$$;

revoke all on function public.save_caleris_circuit_revision(uuid,jsonb) from public, anon;
grant execute on function public.save_caleris_circuit_revision(uuid,jsonb) to authenticated;

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
  c.geometry_status,
  c.circuit_geometry,
  c.geometry_revision,
  c.circuit_kind
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

comment on table public.caleris_circuit_revisions is
  'Append-only revision history for the Testing Circuit Maker; historical race snapshots must keep their referenced revision.';

commit;
