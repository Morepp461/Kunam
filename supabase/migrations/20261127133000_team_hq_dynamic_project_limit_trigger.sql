create or replace function public.enforce_team_hq_project_limit()
returns trigger language plpgsql security definer set search_path='public'
as $function$
declare
 active_count integer;
 factory_bonus integer:=0;
 shop_bonus integer:=0;
 project_limit integer:=2;
begin
 if new.status not in ('queued','in_progress') then return new; end if;
 perform 1 from public.teams where id=new.team_id for update;
 select count(*) into active_count
 from public.caleris_team_hq_projects p
 where p.team_id=new.team_id and p.status in ('queued','in_progress')
 and p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
 select round(greatest(0,coalesce((private.team_hq_effects_for_team(new.team_id)->>'factory_production_capacity_bonus')::numeric,0)))::integer into factory_bonus;
 select case when exists(select 1 from public.caleris_team_hq_slot_entitlements where team_id=new.team_id) then 1 else 0 end into shop_bonus;
 project_limit:=least(4,2+least(1,factory_bonus)+shop_bonus);
 if active_count>=project_limit then
  raise exception 'A team may have at most % active HQ projects.',project_limit using errcode='23514';
 end if;
 return new;
end;
$function$;