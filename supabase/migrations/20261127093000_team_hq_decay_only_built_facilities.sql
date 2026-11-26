-- Unbuilt facilities do not lose condition; start decay only after the first completed level.
create or replace function private.process_team_hq_condition_decay()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_facility public.caleris_team_hq_facilities%rowtype;
  v_days integer;
  v_count integer := 0;
  v_new_condition numeric;
  v_new_level integer;
  v_restore_level integer;
begin
  for v_facility in
    select *
    from public.caleris_team_hq_facilities
    where (level > 0 or maintenance_restore_level is not null)
      and last_condition_decay_at <= now() - interval '24 hours'
    order by last_condition_decay_at, id
    for update skip locked
  loop
    v_days := floor(extract(epoch from (now() - v_facility.last_condition_decay_at)) / 86400)::integer;
    if v_days < 1 then continue; end if;

    v_new_condition := greatest(0, v_facility.condition - v_days);
    v_new_level := v_facility.level;
    v_restore_level := v_facility.maintenance_restore_level;

    if v_new_condition = 0 and v_facility.condition > 0
       and v_facility.level > 0 and v_restore_level is null then
      v_restore_level := v_facility.level;
      v_new_level := v_facility.level - 1;
    end if;

    update public.caleris_team_hq_facilities
    set condition = v_new_condition,
        level = v_new_level,
        maintenance_restore_level = v_restore_level,
        last_condition_decay_at = last_condition_decay_at + make_interval(days => v_days),
        updated_at = now()
    where id = v_facility.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

create or replace function private.reset_team_hq_decay_clock_on_level_increase()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.level > old.level then
    new.last_condition_decay_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_team_hq_level_decay_clock on public.caleris_team_hq_facilities;
create trigger caleris_team_hq_level_decay_clock
before update of level on public.caleris_team_hq_facilities
for each row execute function private.reset_team_hq_decay_clock_on_level_increase();
