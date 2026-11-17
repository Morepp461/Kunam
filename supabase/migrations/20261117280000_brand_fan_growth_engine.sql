-- Configurable fan growth engine, applied once per published race result.
create table if not exists public.caleris_fan_growth_events (
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null references public.license_rounds(id) on delete restrict,
 entity_kind text not null check(entity_kind in ('team','driver')),
 team_id uuid references public.teams(id) on delete restrict,
 member_id uuid references public.members(id) on delete restrict,
 region_key text not null,
 population_delta bigint not null check(population_delta>0),
 growth_rate_percent numeric(8,4) not null,
 created_at timestamptz not null default now(),
 check((entity_kind='team' and team_id is not null and member_id is null)
   or (entity_kind='driver' and member_id is not null and team_id is null))
);
cREATE UNIQUE INDEX IF NOT EXISTS caleris_fan_growth_events_identity_idx ON public.caleris_fan_growth_events(round_id,entity_kind,coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(member_id,'00000000-0000-0000-0000-000000000000'::uuid),region_key);
alter table public.caleris_fan_growth_events enable row level security;
revoke all on public.caleris_fan_growth_events from public,anon,authenticated;
grant select on public.caleris_fan_growth_events to authenticated;
create policy fan_growth_events_admin_read on public.caleris_fan_growth_events for select to authenticated using(public.is_caleris_fia_or_admin());

create or replace function private.apply_fan_growth_for_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_config jsonb;v_base numeric;v_rate numeric;v_multiplier numeric;v_team record;v_driver record;v_fan record;v_delta bigint;v_event uuid;v_teams integer:=0;v_drivers integer:=0;
begin
 select config_value into v_config from public.caleris_brand_ecosystem_config where config_key='fan_growth_config';
 v_base:=coalesce((v_config->>'base_growth_percent')::numeric,0);
 if v_base<=0 then return jsonb_build_object('status','disabled','teams',0,'drivers',0); end if;
 for v_team in
  select e.team_id,min(e.finishing_position) best_position,bool_or(e.finish_status='finished') has_finisher
  from public.caleris_race_result_entries e where e.round_id=p_round_id and e.team_id is not null
  group by e.team_id
 loop
  v_multiplier:=case when v_team.best_position=1 then coalesce((v_config->>'win_multiplier')::numeric,2)
   when v_team.best_position between 2 and 3 then coalesce((v_config->>'podium_multiplier')::numeric,1.5)
   when v_team.best_position between 4 and 10 then coalesce((v_config->>'points_multiplier')::numeric,1)
   when v_team.has_finisher then coalesce((v_config->>'finish_multiplier')::numeric,0.5) else 0 end;
  v_rate:=v_base*v_multiplier;
  if v_rate<=0 then continue; end if;
  for v_fan in select * from public.caleris_fan_populations where entity_kind='team' and team_id=v_team.team_id for update
  loop
   v_delta:=round(v_fan.population*v_rate/100)::bigint;
   if v_delta<=0 then continue; end if;
   insert into public.caleris_fan_growth_events(round_id,entity_kind,team_id,region_key,population_delta,growth_rate_percent)
   values(p_round_id,'team',v_team.team_id,v_fan.region_key,v_delta,v_rate)
   on conflict do nothing returning id into v_event;
   if v_event is not null then
    update public.caleris_fan_populations set population=population+v_delta,updated_at=now() where id=v_fan.id;
    insert into public.caleris_fan_population_history(entity_kind,team_id,region_key,population_delta,source_event,metadata)
    values('team',v_team.team_id,v_fan.region_key,v_delta,'race_result_growth',jsonb_build_object('round_id',p_round_id,'rate',v_rate));
    v_teams:=v_teams+1;
   end if;
   v_event:=null;
  end loop;
 end loop;
 for v_driver in
  select e.member_id,e.finishing_position,e.finish_status from public.caleris_race_result_entries e
  where e.round_id=p_round_id and e.member_id is not null
 loop
  v_multiplier:=case when v_driver.finishing_position=1 then coalesce((v_config->>'win_multiplier')::numeric,2)
   when v_driver.finishing_position between 2 and 3 then coalesce((v_config->>'podium_multiplier')::numeric,1.5)
   when v_driver.finishing_position between 4 and 10 then coalesce((v_config->>'points_multiplier')::numeric,1)
   when v_driver.finish_status='finished' then coalesce((v_config->>'finish_multiplier')::numeric,0.5) else 0 end;
  v_rate:=v_base*v_multiplier;
  if v_rate<=0 then continue; end if;
  for v_fan in select * from public.caleris_fan_populations where entity_kind='driver' and member_id=v_driver.member_id for update
  loop
   v_delta:=round(v_fan.population*v_rate/100)::bigint;
   if v_delta<=0 then continue; end if;
   insert into public.caleris_fan_growth_events(round_id,entity_kind,member_id,region_key,population_delta,growth_rate_percent)
   values(p_round_id,'driver',v_driver.member_id,v_fan.region_key,v_delta,v_rate)
   on conflict(round_id,entity_kind,team_id,member_id,region_key) do nothing returning id into v_event;
   if v_event is not null then
    update public.caleris_fan_populations set population=population+v_delta,updated_at=now() where id=v_fan.id;
    insert into public.caleris_fan_population_history(entity_kind,member_id,region_key,population_delta,source_event,metadata)
    values('driver',v_driver.member_id,v_fan.region_key,v_delta,'race_result_growth',jsonb_build_object('round_id',p_round_id,'rate',v_rate));
    v_drivers:=v_drivers+1;
   end if;
   v_event:=null;
  end loop;
 end loop;
 return jsonb_build_object('status','processed','team_regions',v_teams,'driver_regions',v_drivers);
end $$;
revoke all on function private.apply_fan_growth_for_round(uuid) from public,anon,authenticated;

create or replace function private.trigger_refresh_sponsorship_targets()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.published_at is not null and (tg_op='INSERT' or old.published_at is distinct from new.published_at) then
  perform private.refresh_sponsorship_targets_for_round(new.round_id);
  perform private.apply_fan_growth_for_round(new.round_id);
 end if;
 return new;
end $$;
