-- Automatically recalculate sponsorship performance targets when race results are published.
create or replace function private.refresh_sponsorship_targets_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_season_id uuid;v_division_id uuid;v_target record;v_numerator numeric;v_denominator numeric;v_value numeric;
begin
 select sd.season_id,sd.id into v_season_id,v_division_id
 from public.license_rounds lr join public.license_season_divisions sd on sd.id=lr.season_division_id
 where lr.id=p_round_id;
 if v_season_id is null then return; end if;
 for v_target in
  select t.id,t.metric_key,c.target_team_id,t.target_value
  from public.caleris_sponsorship_targets t
  join public.caleris_sponsorship_contracts c on c.id=t.contract_id and c.status='active' and c.target_kind='team'
  where t.season_id=v_season_id and t.status not in ('missed','cancelled')
 loop
  if v_target.metric_key='points_round_rate' then
   select count(*) filter(where exists(select 1 from public.caleris_race_result_entries e
     join public.license_rounds lr2 on lr2.id=e.round_id
     where e.team_id=v_target.target_team_id and e.round_id=rr.round_id and e.finishing_position between 1 and 10)),
    count(*) into v_numerator,v_denominator
   from public.caleris_race_results rr join public.license_rounds lr on lr.id=rr.round_id
   where rr.published_at is not null and lr.season_division_id=v_division_id;
  elsif v_target.metric_key='podium_round_rate' then
   select count(*) filter(where exists(select 1 from public.caleris_race_result_entries e
     where e.team_id=v_target.target_team_id and e.round_id=rr.round_id and e.finishing_position between 1 and 3)),
    count(*) into v_numerator,v_denominator
   from public.caleris_race_results rr join public.license_rounds lr on lr.id=rr.round_id
   where rr.published_at is not null and lr.season_division_id=v_division_id;
  elsif v_target.metric_key='win_round_rate' then
   select count(*) filter(where exists(select 1 from public.caleris_race_result_entries e
     where e.team_id=v_target.target_team_id and e.round_id=rr.round_id and e.finishing_position=1)),
    count(*) into v_numerator,v_denominator
   from public.caleris_race_results rr join public.license_rounds lr on lr.id=rr.round_id
   where rr.published_at is not null and lr.season_division_id=v_division_id;
  elsif v_target.metric_key='finish_rate' then
   select count(*) filter(where e.finish_status='finished'),count(*)
   into v_numerator,v_denominator
   from public.caleris_race_result_entries e join public.license_rounds lr on lr.id=e.round_id
   join public.caleris_race_results rr on rr.round_id=e.round_id and rr.published_at is not null
   where lr.season_division_id=v_division_id and e.team_id=v_target.target_team_id;
  else
   continue;
  end if;
  v_value:=case when coalesce(v_denominator,0)=0 then 0 else round(v_numerator/v_denominator*100,2) end;
  update public.caleris_sponsorship_targets set current_value=v_value,
   status=case when v_value>=target_value then 'achieved' else 'in_progress' end
  where id=v_target.id;
 end loop;
end $$;
revoke all on function private.refresh_sponsorship_targets_for_round(uuid) from public,anon,authenticated;

create or replace function private.trigger_refresh_sponsorship_targets()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.published_at is not null and (tg_op='INSERT' or old.published_at is distinct from new.published_at) then
  perform private.refresh_sponsorship_targets_for_round(new.round_id);
 end if;
 return new;
end $$;
drop trigger if exists caleris_sponsorship_target_race_refresh on public.caleris_race_results;
create trigger caleris_sponsorship_target_race_refresh
after insert or update of published_at on public.caleris_race_results
for each row execute function private.trigger_refresh_sponsorship_targets();

create or replace function public.admin_create_sponsorship_target(p_contract_id uuid,p_title text,p_description text,p_metric_key text,p_target_value numeric,p_bonus_amount numeric,p_due_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_contract public.caleris_sponsorship_contracts%rowtype;v_season uuid;v_pool numeric;v_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat mengatur target sponsor.'; end if;
 if p_target_value is null or p_target_value<=0 or p_bonus_amount is null or p_bonus_amount<0 then raise exception 'Nilai target atau bonus tidak valid.'; end if;
 select * into v_contract from public.caleris_sponsorship_contracts where id=p_contract_id and status='active' and target_kind='team';
 if not found then raise exception 'Kontrak sponsor tidak aktif.'; end if;
 v_season:=v_contract.season_id;
 select pool_total-pool_paid into v_pool from public.caleris_sponsorship_season_bonus_pools where contract_id=p_contract_id and season_id=v_season;
 if v_pool is null or p_bonus_amount>v_pool then raise exception 'Bonus melebihi sisa bonus pool season.'; end if;
 insert into public.caleris_sponsorship_targets(contract_id,season_id,title,description,metric_key,target_value,bonus_amount,due_at)
 values(p_contract_id,v_season,trim(p_title),nullif(trim(p_description),''),trim(p_metric_key),p_target_value,p_bonus_amount,p_due_at)
 returning id into v_id;
 return v_id;
end $$;
