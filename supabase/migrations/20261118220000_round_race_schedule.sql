alter table public.license_rounds
  add column if not exists race_starts_at timestamptz,
  add column if not exists race_duration_minutes integer not null default 90;

update public.license_rounds
set race_starts_at = (
  ((checkin_opens_at at time zone 'Asia/Jakarta')::date + time '19:00') at time zone 'Asia/Jakarta'
)
where race_starts_at is null;

alter table public.license_rounds
  alter column race_starts_at set not null,
  add constraint license_rounds_race_duration_positive
    check (race_duration_minutes between 1 and 600);

create or replace function public.fia_set_season_round_schedules(p_schedules jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_round_id uuid;
  v_time time;
  v_duration integer;
  v_updated integer:=0;
  v_round record;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya Admin atau FIA yang dapat mengatur jadwal race.';
  end if;
  if jsonb_typeof(p_schedules) is distinct from 'array' or jsonb_array_length(p_schedules)=0 then
    raise exception 'Daftar jadwal race tidak valid.';
  end if;
  for v_item in select value from jsonb_array_elements(p_schedules) loop
    v_round_id:=(v_item->>'round_id')::uuid;
    v_time:=(v_item->>'race_time')::time;
    v_duration:=(v_item->>'duration_minutes')::integer;
    if v_duration not between 1 and 600 then
      raise exception 'Durasi race harus 1 sampai 600 menit.';
    end if;
    select lr.id,lr.checkin_opens_at into v_round
    from public.license_rounds lr
    where lr.id=v_round_id
    for update;
    if not found then raise exception 'Race round tidak ditemukan.'; end if;
    update public.license_rounds
    set race_starts_at=(
      ((v_round.checkin_opens_at at time zone 'Asia/Jakarta')::date + v_time)
      at time zone 'Asia/Jakarta'
    ),
    race_duration_minutes=v_duration
    where id=v_round_id;
    v_updated:=v_updated+1;
  end loop;
  return jsonb_build_object('updated',v_updated);
end;
$$;

revoke all on function public.fia_set_season_round_schedules(jsonb) from public,anon;
grant execute on function public.fia_set_season_round_schedules(jsonb) to authenticated;

comment on column public.license_rounds.race_starts_at is 'Official race start timestamp; configured in Asia/Jakarta (GMT+7).';
comment on column public.license_rounds.race_duration_minutes is 'Scheduled race duration in minutes; default 90.';