-- Driver fan bases remain attached to the driver across transfers; record snapshots without duplicating fans.
create table if not exists public.caleris_fan_transfer_history (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.members(id) on delete restrict,
 previous_team_id uuid references public.teams(id) on delete set null,
 new_team_id uuid references public.teams(id) on delete set null,
 regional_population_snapshot jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 check(previous_team_id is distinct from new_team_id)
);
alter table public.caleris_fan_transfer_history enable row level security;
revoke all on public.caleris_fan_transfer_history from public,anon,authenticated;
grant select on public.caleris_fan_transfer_history to authenticated;
create policy fan_transfer_history_participants on public.caleris_fan_transfer_history for select to authenticated using(
 public.is_caleris_fia_or_admin() or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=member_id)
);

create or replace function private.log_driver_fan_transfer()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb;
begin
 if new.role='Driver' and old.team_id is distinct from new.team_id then
  select coalesce(jsonb_object_agg(region_key,population),'{}'::jsonb) into v_snapshot
  from public.caleris_fan_populations
  where entity_kind='driver' and member_id=new.id;
  insert into public.caleris_fan_transfer_history(member_id,previous_team_id,new_team_id,regional_population_snapshot)
  values(new.id,old.team_id,new.team_id,coalesce(v_snapshot,'{}'::jsonb));
 end if;
 return new;
end $$;
revoke all on function private.log_driver_fan_transfer() from public,anon,authenticated;
drop trigger if exists caleris_driver_fan_transfer_history on public.members;
create trigger caleris_driver_fan_transfer_history
after update of team_id on public.members
for each row execute function private.log_driver_fan_transfer();
