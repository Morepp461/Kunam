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

-- Authoritative season payload for Predictor and Yearbook; scoring is read from live FIA point rules.
create or replace function public.caleris_get_season_community_data(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $func$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 select jsonb_build_object(
   'season',to_jsonb(s),
   'divisions',coalesce((select jsonb_agg(jsonb_build_object(
     'division_id',sd.id,'division',sd.division_name,
     'drivers',(select coalesce(jsonb_agg(jsonb_build_object('member_id',fs.member_id,'name',fs.driver_name_snapshot,'team',fs.team_name_snapshot,'points',fs.final_points,'position',fs.final_position) order by fs.final_position nulls last,fs.final_points desc),'[]'::jsonb) from public.license_final_standings fs where fs.season_division_id=sd.id),
     'teams',(select coalesce(jsonb_agg(jsonb_build_object('team_id',ts.team_id,'name',ts.team_name_snapshot,'points',ts.final_points,'position',ts.final_position) order by ts.final_position nulls last,ts.final_points desc),'[]'::jsonb) from public.license_team_final_standings ts where ts.season_division_id=sd.id),
     'rounds',(select coalesce(jsonb_agg(jsonb_build_object('round_id',r.id,'round_number',r.round_number,'title',r.title,'session_type',r.session_type,'status',r.status,'race_lifecycle_status',r.race_lifecycle_status) order by r.round_number),'[]'::jsonb) from public.license_rounds r where r.season_division_id=sd.id),
     'race_results',(select coalesce(jsonb_agg(jsonb_build_object('member_id',e.member_id,'team_id',e.team_id,'driver',e.driver_name_snapshot,'team',e.team_name_snapshot,'round_id',e.round_id,'position',e.finishing_position,'status',e.finish_status) order by e.round_id,e.finishing_position),'[]'::jsonb) from public.license_rounds r join public.caleris_race_result_entries e on e.round_id=r.id where r.season_division_id=sd.id)
   ) order by sd.division_name),'[]'::jsonb),
   'scoring_rules',(select coalesce(jsonb_agg(jsonb_build_object('session_type',pr.session_type,'position',pr.finishing_position,'points',pr.points,'pole_bonus',pr.pole_bonus) order by pr.session_type,pr.finishing_position),'[]'::jsonb) from public.caleris_race_points_rules pr where pr.is_active)
 ) into result
 from public.license_seasons s where s.id=p_season;
 return coalesce(result,'{}'::jsonb);
end; $func$;
grant execute on function public.caleris_get_season_community_data(uuid) to authenticated;
revoke all on function public.caleris_refresh_team_milestones(uuid) from public,anon,authenticated;
revoke all on function public.caleris_log_activity(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
