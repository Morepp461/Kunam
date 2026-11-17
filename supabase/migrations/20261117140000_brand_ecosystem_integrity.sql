-- Correct nullable regional fan identity and require explicit sponsor offer value bands.
alter table public.caleris_fan_populations drop constraint if exists caleris_fan_populations_pkey;
alter table public.caleris_fan_populations add column if not exists id uuid default gen_random_uuid();
update public.caleris_fan_populations set id=gen_random_uuid() where id is null;
alter table public.caleris_fan_populations alter column id set not null;
alter table public.caleris_fan_populations add constraint caleris_fan_populations_pkey primary key(id);
alter table public.caleris_fan_populations alter column team_id drop not null;
alter table public.caleris_fan_populations alter column member_id drop not null;
create unique index if not exists caleris_fan_populations_identity_idx
 on public.caleris_fan_populations(entity_kind,coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid),
 coalesce(member_id,'00000000-0000-0000-0000-000000000000'::uuid),region_key);

create or replace function public.admin_adjust_fan_population(p_entity_kind text,p_team_id uuid,p_member_id uuid,p_region_key text,p_delta bigint,p_source_event text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_current bigint;v_next bigint;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_delta=0 or p_region_key is null or length(trim(p_region_key)) not between 2 and 64 then raise exception 'Perubahan populasi tidak valid.'; end if;
 if p_entity_kind='team' and (p_team_id is null or p_member_id is not null or not exists(select 1 from public.teams where id=p_team_id)) then raise exception 'Target tim tidak valid.'; end if;
 if p_entity_kind='driver' and (p_member_id is null or p_team_id is not null or not exists(select 1 from public.members where id=p_member_id and role='Driver')) then raise exception 'Target driver tidak valid.'; end if;
 if p_entity_kind='neutral' and (p_team_id is not null or p_member_id is not null) then raise exception 'Target neutral tidak valid.'; end if;
 insert into public.caleris_fan_populations(entity_kind,team_id,member_id,region_key,population)
 values(p_entity_kind,p_team_id,p_member_id,trim(p_region_key),greatest(0,p_delta))
 on conflict do nothing;
 select population into v_current from public.caleris_fan_populations where entity_kind=p_entity_kind
  and team_id is not distinct from p_team_id and member_id is not distinct from p_member_id and region_key=trim(p_region_key) for update;
 v_next:=v_current+p_delta;
 if v_next<0 then raise exception 'Populasi fans tidak boleh negatif.'; end if;
 update public.caleris_fan_populations set population=v_next,updated_at=now()
 where entity_kind=p_entity_kind and team_id is not distinct from p_team_id and member_id is not distinct from p_member_id and region_key=trim(p_region_key);
 insert into public.caleris_fan_population_history(entity_kind,team_id,member_id,region_key,population_delta,source_event,metadata)
 values(p_entity_kind,p_team_id,p_member_id,trim(p_region_key),p_delta,p_source_event,coalesce(p_metadata,'{}'::jsonb));
 return jsonb_build_object('population',v_next);
end $$;

create or replace function public.generate_team_sponsorship_offers(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_team record;v_sponsor record;v_created integer:=0;v_offer uuid;v_amount numeric;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if not exists(select 1 from public.license_seasons where id=p_season_id) then raise exception 'Season tidak ditemukan.'; end if;
 for v_team in
  select t.id,coalesce(r.score,0) score,coalesce((select sum(f.population) from public.caleris_fan_populations f where f.entity_kind='team' and f.team_id=t.id),0) fans
  from public.teams t left join public.caleris_team_reputation r on r.team_id=t.id
 loop
  for v_sponsor in
   select s.*,tr.minimum_budget as tier_minimum_budget from public.caleris_sponsors s
   join public.caleris_sponsor_tier_rules tr on tr.tier_key=s.tier_key and tr.is_active
   where s.is_active and s.available_budget is not null and s.available_budget>=tr.minimum_budget
    and v_team.score>=tr.minimum_team_reputation and v_team.fans>=tr.minimum_fan_population
    and (tr.maximum_budget is null or s.available_budget<=tr.maximum_budget)
    and nullif(s.target_audience->>'offer_amount_min','') is not null
    and nullif(s.target_audience->>'offer_amount_max','') is not null
    and not exists(select 1 from public.caleris_sponsorship_offers o where o.sponsor_id=s.id and o.target_team_id=v_team.id and o.season_id=p_season_id and o.status in ('offered','negotiating','accepted'))
    and not exists(select 1 from public.caleris_sponsorship_contracts c where c.sponsor_id=s.id and c.target_team_id=v_team.id and c.season_id=p_season_id and c.status='active')
  loop
   v_amount:=least(v_sponsor.available_budget, greatest((v_sponsor.target_audience->>'offer_amount_min')::numeric,
     least((v_sponsor.target_audience->>'offer_amount_max')::numeric,(v_sponsor.target_audience->>'offer_amount_min')::numeric)));
   if v_amount<=0 or v_amount<>round(v_amount,2) then continue; end if;
   insert into public.caleris_sponsorship_offers(sponsor_id,target_kind,target_team_id,season_id,proposed_amount,terms,status,expires_at,created_by,generated_by_engine)
   values(v_sponsor.id,'team',v_team.id,p_season_id,v_amount,jsonb_build_object('tier',v_sponsor.tier_key,'duration_seasons',1),'offered',now()+interval '7 days',(select auth.uid()),true)
   returning id into v_offer;
   insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
   values(v_offer,'admin',v_amount,jsonb_build_object('tier',v_sponsor.tier_key,'duration_seasons',1));
   v_created:=v_created+1;
  end loop;
 end loop;
 return jsonb_build_object('created',v_created);
end $$;
