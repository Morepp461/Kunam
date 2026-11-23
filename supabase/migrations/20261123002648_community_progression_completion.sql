-- Complete community progression integrations against authoritative Caleris season data.
create or replace function public.caleris_log_activity(p_actor uuid,p_team uuid,p_type text,p_title text,p_body text,p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $func$
begin
 insert into public.caleris_activity_feed(actor_member_id,team_id,event_type,title,body,metadata,visibility)
 values(p_actor,p_team,p_type,left(p_title,160),left(coalesce(p_body,''),500),coalesce(p_meta,'{}'::jsonb),'community');
end; $func$;

create or replace function public.caleris_refresh_team_milestones(p_team uuid)
returns void language plpgsql security definer set search_path=public as $func$
declare d record; v numeric;
begin
 if p_team is null then return; end if;
 for d in select * from public.caleris_milestone_definitions where active and scope='team' loop
   v := case d.metric_key
     when 'team_races' then (select count(distinct e.round_id)::numeric from public.caleris_race_result_entries e where e.team_id=p_team)
     when 'team_wins' then (select count(*)::numeric from public.caleris_race_result_entries e where e.team_id=p_team and e.finishing_position=1)
     when 'team_podiums' then (select count(*)::numeric from public.caleris_race_result_entries e where e.team_id=p_team and e.finishing_position between 1 and 3)
     when 'team_drivers' then (select count(*)::numeric from public.members m where m.team_id=p_team and m.role='Driver')
     else null end;
   if v is not null then
     insert into public.caleris_milestone_progress(milestone_id,scope,team_id,current_value,completed_at)
     values(d.id,'team',p_team,v,case when v>=d.target_value then now() end)
     on conflict(milestone_id,team_id) do update set current_value=excluded.current_value,
       completed_at=coalesce(caleris_milestone_progress.completed_at,excluded.completed_at),updated_at=now();
   end if;
 end loop;
end; $func$;

create or replace function public.caleris_team_result_milestone_trigger()
returns trigger language plpgsql security definer set search_path=public as $func$
begin
 perform public.caleris_refresh_team_milestones(new.team_id);
 if new.member_id is not null then
   perform public.caleris_log_activity(new.member_id,new.team_id,'race_result','Hasil balapan tercatat',
     coalesce(new.driver_name_snapshot,'Driver')||' menyelesaikan ronde dengan posisi '||coalesce(new.finishing_position::text,'-'),
     jsonb_build_object('round_id',new.round_id,'position',new.finishing_position));
 end if;
 return new;
end; $func$;
drop trigger if exists caleris_community_race_activity on public.caleris_race_result_entries;
create trigger caleris_community_race_activity after insert on public.caleris_race_result_entries
for each row execute function public.caleris_team_result_milestone_trigger();

create or replace function public.caleris_community_checkin_activity()
returns trigger language plpgsql security definer set search_path=public as $func$
declare t uuid;
begin select team_id into t from public.members where id=new.member_id;
 perform public.caleris_log_activity(new.member_id,t,'checkin','Race check-in','Member melakukan check-in race.',
 jsonb_build_object('round_id',new.round_id,'date',new.checkin_date));
 return new;
end; $func$;
drop trigger if exists caleris_community_checkin_feed on public.license_daily_checkins;
create trigger caleris_community_checkin_feed after insert on public.license_daily_checkins
for each row execute function public.caleris_community_checkin_activity();

create or replace function public.caleris_community_quest_activity()
returns trigger language plpgsql security definer set search_path=public as $func$
declare t uuid;
begin
 if new.completed_at is not null and old.completed_at is distinct from new.completed_at then
   t:=new.team_id;
   perform public.caleris_log_activity(new.member_id,t,'quest_completed','Quest diselesaikan','Member menyelesaikan quest.',
     jsonb_build_object('quest_assignment_id',new.id,'scope',new.assignment_scope));
 end if;
 return new;
end; $func$;
drop trigger if exists caleris_community_quest_feed on public.caleris_quest_assignments;
create trigger caleris_community_quest_feed after update of completed_at on public.caleris_quest_assignments
for each row execute function public.caleris_community_quest_activity();

create or replace function public.caleris_community_shop_activity()
returns trigger language plpgsql security definer set search_path=public as $func$
declare t uuid;
begin
 select team_id into t from public.members where id=new.member_id;
 perform public.caleris_log_activity(new.member_id,t,'development_purchase','Development dibeli',
   'Pembelian token development tercatat.',jsonb_build_object('purchase_id',new.id,'token_type',new.token_type,'quantity',new.quantity));
 return new;
end; $func$;
drop trigger if exists caleris_community_shop_feed on public.caleris_development_shop_purchases;
create trigger caleris_community_shop_feed after insert on public.caleris_development_shop_purchases
for each row execute function public.caleris_community_shop_activity();

