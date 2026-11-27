begin;

alter table public.caleris_achievement_badges
  add column if not exists category text not null default 'motorsport';
alter table public.caleris_achievement_badges
  drop constraint if exists caleris_achievement_badges_category_check;
alter table public.caleris_achievement_badges
  add constraint caleris_achievement_badges_category_check
  check(category in ('roles','motorsport','seasons','divisions','teams','drivers','principals','agents','community'));

alter table public.caleris_xp_ledger drop constraint if exists caleris_xp_ledger_source_type_check;
alter table public.caleris_xp_ledger add constraint caleris_xp_ledger_source_type_check
check(source_type=any(array['race_result','race_result_correction','checkin','quest','milestone','shop_purchase','admin_adjustment','achievement']::text[]));

insert into public.caleris_achievement_badges(code,title,description,icon,rarity,active,category) values
('role_driver','Race Licence Holder','Officially registered as a CALERIS driver.','flag','common',true,'roles'),
('role_team_owner','Team Principal Owner','Owns and operates a CALERIS team.','crown','rare',true,'roles'),
('role_principal','Team Principal','Serves as a team principal.','shield-check','common',true,'principals'),
('role_agent','Driver Agent','Represents a driver in the CALERIS paddock.','handshake','common',true,'agents'),
('driver_first_start','First Start','Completed the first official race entry.','flag','common',true,'drivers'),
('driver_ten_starts','Ten Race Starts','Completed ten official race entries.','flag','rare',true,'drivers'),
('driver_25_starts','25 Race Starts','Completed 25 official race entries.','flag','epic',true,'drivers'),
('driver_first_podium','First Podium','Reached the official podium for the first time.','medal','rare',true,'drivers'),
('driver_ten_podiums','Ten Podiums','Collected ten official podium finishes.','award','epic',true,'drivers'),
('driver_100_points','Century Club','Scored 100 official championship points.','target','rare',true,'motorsport'),
('driver_500_points','Five Hundred Club','Scored 500 official championship points.','trophy','epic',true,'motorsport'),
('driver_first_win','First Victory','Won an official race for the first time.','crown','rare',true,'drivers'),
('driver_five_wins','Five Victories','Won five official races.','trophy','epic',true,'drivers'),
('driver_season_champion','Season Champion','Won an official season championship.','crown','legendary',true,'seasons'),
('team_full_lineup','Full Driver Line-up','Registered two drivers to the team.','users','common',true,'teams'),
('team_first_podium','Team Podium','Achieved the team''s first official podium.','medal','rare',true,'teams'),
('team_ten_podiums','Ten Team Podiums','Collected ten official team podiums.','award','epic',true,'teams'),
('team_ten_races','Ten Race Weekends','Completed ten official team race weekends.','flag','rare',true,'teams'),
('team_first_win','Team Victory','Won an official race as a team for the first time.','trophy','rare',true,'teams'),
('team_five_wins','Five Team Victories','Won five official races as a team.','trophy','epic',true,'teams'),
('team_champion','Team Champion','Won an official team championship.','crown','legendary',true,'teams'),
('season_participant','Season Participant','Recorded an official race result in a CALERIS season.','calendar-check','common',true,'seasons'),
('division_competitor','Division Competitor','Recorded an official result in a CALERIS division.','medal','common',true,'divisions'),
('community_first_vote','Community Voice','Cast the first official community vote.','vote','common',true,'community'),
('community_ten_checkins','Paddock Regular','Completed ten official race check-ins.','calendar-check','rare',true,'community'),
('community_first_quest','Quest Completed','Claimed the first completed community quest reward.','target','common',true,'community')
on conflict(code) do update set
  title=excluded.title,description=excluded.description,icon=excluded.icon,rarity=excluded.rarity,
  active=true,category=excluded.category;
update public.caleris_achievement_badges set category='community' where code='community_voice';

update public.caleris_milestone_definitions set badge_code=case code
  when 'career_100_points' then 'driver_100_points'
  when 'career_500_points' then 'driver_500_points'
  when 'career_first_podium' then 'driver_first_podium'
  when 'career_first_title' then 'driver_season_champion'
  when 'career_first_win' then 'driver_first_win'
  when 'career_five_wins' then 'driver_five_wins'
  when 'career_race_starts_1' then 'driver_first_start'
  when 'career_race_starts_10' then 'driver_ten_starts'
  when 'career_race_starts_25' then 'driver_25_starts'
  when 'career_ten_podiums' then 'driver_ten_podiums'
  when 'team_drivers_2' then 'team_full_lineup'
  when 'team_first_podium' then 'team_first_podium'
  when 'team_first_title' then 'team_champion'
  when 'team_first_win' then 'team_first_win'
  when 'team_podiums_10' then 'team_ten_podiums'
  when 'team_races_10' then 'team_ten_races'
  when 'team_wins_5' then 'team_five_wins'
  else badge_code end
where code in (
  'career_100_points','career_500_points','career_first_podium','career_first_title','career_first_win',
  'career_five_wins','career_race_starts_1','career_race_starts_10','career_race_starts_25','career_ten_podiums',
  'team_drivers_2','team_first_podium','team_first_title','team_first_win','team_podiums_10','team_races_10','team_wins_5'
);

create or replace function private.caleris_achievement_reward_xp(p_badge_code text)
returns integer language sql immutable set search_path=''
as $function$
  select case p_badge_code
    when 'role_driver' then 5 when 'role_team_owner' then 5 when 'role_principal' then 5 when 'role_agent' then 5
    when 'driver_first_start' then 5 when 'driver_ten_starts' then 10 when 'driver_25_starts' then 15
    when 'driver_first_podium' then 5 when 'driver_ten_podiums' then 12
    when 'driver_100_points' then 8 when 'driver_500_points' then 15 when 'driver_first_win' then 10
    when 'driver_five_wins' then 18 when 'driver_season_champion' then 20
    when 'team_full_lineup' then 5 when 'team_first_podium' then 5 when 'team_ten_podiums' then 12
    when 'team_ten_races' then 10 when 'team_first_win' then 10 when 'team_five_wins' then 18
    when 'team_champion' then 20 when 'season_participant' then 5 when 'division_competitor' then 5
    when 'community_first_vote' then 5 when 'community_ten_checkins' then 10 when 'community_first_quest' then 5
    else null end;
$function$;

create or replace function private.award_caleris_achievement(p_member_id uuid,p_badge_code text)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_xp integer; v_inserted integer:=0;
begin
  if p_member_id is null or p_badge_code is null then return false; end if;
  v_xp:=private.caleris_achievement_reward_xp(p_badge_code);
  if v_xp is null or v_xp not between 5 and 20 then raise exception 'achievement_reward_out_of_range'; end if;
  if not exists(select 1 from public.caleris_achievement_badges where code=p_badge_code and active=true) then return false; end if;
  insert into public.caleris_member_badges(member_id,badge_code,source_type,source_id)
  values(p_member_id,p_badge_code,'achievement',p_badge_code)
  on conflict(member_id,badge_code) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return false; end if;
  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
  values(p_member_id,v_xp,'achievement',p_badge_code,'Achievement reward: '||p_badge_code)
  on conflict(member_id,source_type,source_id) do nothing;
  return true;
end;
$function$;

create or replace function private.caleris_award_role_achievement()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if tg_op='UPDATE' and new.role is not distinct from old.role then return new; end if;
  case new.role
    when 'Driver' then perform private.award_caleris_achievement(new.id,'role_driver');
    when 'Owner' then perform private.award_caleris_achievement(new.id,'role_team_owner');
    when 'Principal' then perform private.award_caleris_achievement(new.id,'role_principal');
    when 'Agent' then perform private.award_caleris_achievement(new.id,'role_agent');
    else null;
  end case;
  return new;
end;
$function$;

drop trigger if exists caleris_role_achievement_award on public.members;
create trigger caleris_role_achievement_award
after insert or update of role on public.members
for each row execute function private.caleris_award_role_achievement();

create or replace function private.caleris_award_checkin_achievement()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if (select count(*) from public.caleris_member_race_checkins where member_id=new.member_id)>=10 then
    perform private.award_caleris_achievement(new.member_id,'community_ten_checkins');
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_achievement_checkin_award on public.caleris_member_race_checkins;
create trigger caleris_achievement_checkin_award
after insert on public.caleris_member_race_checkins
for each row execute function private.caleris_award_checkin_achievement();

create or replace function private.caleris_award_quest_achievement()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.reward_status='paid' and old.reward_status is distinct from 'paid' and new.member_id is not null then
    perform private.award_caleris_achievement(new.member_id,'community_first_quest');
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_achievement_quest_award on public.caleris_quest_assignments;
create trigger caleris_achievement_quest_award
after update of reward_status on public.caleris_quest_assignments
for each row execute function private.caleris_award_quest_achievement();

create or replace function private.caleris_award_vote_achievement()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  perform private.award_caleris_achievement(new.voter_member_id,'community_first_vote');
  return new;
end;
$function$;

drop trigger if exists caleris_achievement_vote_award on public.caleris_community_votes;
create trigger caleris_achievement_vote_award
after insert on public.caleris_community_votes
for each row execute function private.caleris_award_vote_achievement();

do $role_backfill$
declare v_member record; v_badge text;
begin
  for v_member in select id,role from public.members where role in ('Driver','Owner','Principal','Agent') loop
    v_badge:=case v_member.role when 'Driver' then 'role_driver' when 'Owner' then 'role_team_owner'
      when 'Principal' then 'role_principal' when 'Agent' then 'role_agent' else null end;
    if v_badge is not null then perform private.award_caleris_achievement(v_member.id,v_badge); end if;
  end loop;
end;
$role_backfill$;

do $patch_driver_milestones$
declare d text; old_guard text; new_guard text;
begin
  d:=pg_get_functiondef('public.caleris_refresh_driver_milestones(uuid)'::regprocedure);
  old_guard:='if p_member is null or not exists(select 1 from public.members where id=p_member) then return; end if;';
  new_guard:='if p_member is null or not exists(select 1 from public.members where id=p_member and role=''Driver'') then return; end if;';
  if position(old_guard in d)=0 then raise exception 'Driver milestone scope changed; refusing unsafe patch.'; end if;
  execute replace(d,old_guard,new_guard);
end;
$patch_driver_milestones$;

create or replace function private.caleris_award_race_achievements()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_lifecycle text; v_division_key text;
begin
  if new.member_id is null then return new; end if;
  select r.race_lifecycle_status,d.division_key into v_lifecycle,v_division_key
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  where r.id=new.round_id;
  if coalesce(lower(v_lifecycle),'') not in ('completed','closed') then return new; end if;
  perform private.award_caleris_achievement(new.member_id,'season_participant');
  if v_division_key is not null then
    perform private.award_caleris_achievement(new.member_id,'division_competitor');
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_achievement_race_result_award on public.caleris_race_result_entries;
create trigger caleris_achievement_race_result_award
after insert or update of member_id,round_id on public.caleris_race_result_entries
for each row execute function private.caleris_award_race_achievements();

create or replace function private.caleris_award_round_achievements()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_member record;
begin
  if lower(coalesce(new.race_lifecycle_status,'')) not in ('completed','closed') then return new; end if;
  if tg_op='UPDATE' and lower(coalesce(old.race_lifecycle_status,'')) in ('completed','closed') then return new; end if;
  for v_member in select distinct member_id from public.caleris_race_result_entries where round_id=new.id and member_id is not null loop
    perform private.award_caleris_achievement(v_member.member_id,'season_participant');
    perform private.award_caleris_achievement(v_member.member_id,'division_competitor');
  end loop;
  return new;
end;
$function$;

drop trigger if exists caleris_achievement_round_close_award on public.license_rounds;
create trigger caleris_achievement_round_close_award
after update of race_lifecycle_status on public.license_rounds
for each row execute function private.caleris_award_round_achievements();

do $achievement_history_backfill$
declare v_row record;
begin
  for v_row in
    select id,role from public.members where role in ('Driver','Owner','Principal','Agent')
  loop
    case v_row.role
      when 'Driver' then perform private.award_caleris_achievement(v_row.id,'role_driver');
      when 'Owner' then perform private.award_caleris_achievement(v_row.id,'role_team_owner');
      when 'Principal' then perform private.award_caleris_achievement(v_row.id,'role_principal');
      when 'Agent' then perform private.award_caleris_achievement(v_row.id,'role_agent');
    end case;
  end loop;

  for v_row in
    select distinct e.member_id
    from public.caleris_race_result_entries e
    join public.license_rounds r on r.id=e.round_id
    where e.member_id is not null and lower(coalesce(r.race_lifecycle_status,'')) in ('completed','closed')
  loop
    perform private.award_caleris_achievement(v_row.member_id,'season_participant');
    perform private.award_caleris_achievement(v_row.member_id,'division_competitor');
  end loop;

  for v_row in
    select member_id from public.caleris_member_race_checkins
    group by member_id having count(*)>=10
  loop
    perform private.award_caleris_achievement(v_row.member_id,'community_ten_checkins');
  end loop;

  for v_row in
    select distinct member_id from public.caleris_quest_assignments
    where member_id is not null and reward_status='paid'
  loop
    perform private.award_caleris_achievement(v_row.member_id,'community_first_quest');
  end loop;

  for v_row in
    select distinct voter_member_id as member_id from public.caleris_community_votes
    where voter_member_id is not null
  loop
    perform private.award_caleris_achievement(v_row.member_id,'community_first_vote');
  end loop;

  for v_row in select id from public.members where role='Driver'
  loop
    perform public.caleris_refresh_driver_milestones(v_row.id);
  end loop;

  for v_row in select id from public.teams
  loop
    perform public.caleris_refresh_team_milestones(v_row.id);
  end loop;
end;
$achievement_history_backfill$;

create table if not exists public.caleris_digital_id_templates (
  template_key text primary key,
  group_key text not null check(group_key in ('license','reputation','division')),
  title text not null,
  layout_variant text not null unique,
  accent_color text not null check(accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order smallint not null unique,
  active boolean not null default true
);

insert into public.caleris_digital_id_templates(template_key,group_key,title,layout_variant,accent_color,sort_order) values
('license_bronze','license','Bronze License','license-badge','#B37C53',1),
('license_silver','license','Silver License','license-reverse','#B7C0CA',2),
('license_gold','license','Gold License','license-stamp','#D6B45E',3),
('license_super_license','license','Super License','license-wide','#E2D5B4',4),
('reputation_developing','reputation','Developing Reputation','rep-editorial','#9C9B83',5),
('reputation_established','reputation','Established Reputation','rep-classic','#7EAA9C',6),
('reputation_competitive','reputation','Competitive Reputation','rep-performance','#D2A45E',7),
('reputation_top','reputation','Top Reputation','rep-portrait','#BD7D87',8),
('reputation_elite','reputation','Elite Reputation','rep-hall-of-fame','#E4D7A4',9),
('division_tier_1','division','Division Tier 1','division-premio','#BD9A56',10),
('division_tier_2','division','Division Tier 2','division-zwei','#A5A9B0',11),
('division_tier_3','division','Division Tier 3','division-future-3','#A9A27E',12),
('division_tier_4','division','Division Tier 4','division-future-4','#9D7F9D',13),
('division_tier_5','division','Division Tier 5','division-future-5','#D6C6A2',14)
on conflict(template_key) do update set
  group_key=excluded.group_key,title=excluded.title,layout_variant=excluded.layout_variant,
  accent_color=excluded.accent_color,sort_order=excluded.sort_order,active=true;

create table if not exists public.caleris_digital_id_division_tier_map (
  division_key text primary key,
  tier_rank smallint not null check(tier_rank between 1 and 5),
  created_at timestamptz not null default now()
);
insert into public.caleris_digital_id_division_tier_map(division_key,tier_rank)
values('premio',1),('zwei',2)
on conflict(division_key) do update set tier_rank=excluded.tier_rank;

alter table public.caleris_digital_id_templates enable row level security;
alter table public.caleris_digital_id_division_tier_map enable row level security;
drop policy if exists caleris_digital_id_templates_read on public.caleris_digital_id_templates;
create policy caleris_digital_id_templates_read on public.caleris_digital_id_templates
for select to authenticated using(active);
drop policy if exists caleris_digital_id_division_tier_read on public.caleris_digital_id_division_tier_map;
create policy caleris_digital_id_division_tier_read on public.caleris_digital_id_division_tier_map
for select to authenticated using(true);
revoke all on public.caleris_digital_id_templates,public.caleris_digital_id_division_tier_map from public,anon,authenticated;
grant select on public.caleris_digital_id_templates,public.caleris_digital_id_division_tier_map to authenticated;

alter table public.caleris_digital_id_cards
  add column if not exists template_key text references public.caleris_digital_id_templates(template_key) on delete restrict;
alter table public.caleris_digital_id_cards
  add column if not exists selected_badges text[] not null default '{}'::text[];
alter table public.caleris_digital_id_cards
  drop constraint if exists caleris_digital_id_selected_badges_limit;
alter table public.caleris_digital_id_cards
  add constraint caleris_digital_id_selected_badges_limit check(cardinality(selected_badges)<=3);

create or replace function private.caleris_digital_id_unlocked_templates(p_member_id uuid)
returns text[] language plpgsql stable security definer set search_path=''
as $function$
declare
  v_member public.members%rowtype;
  v_band text;
  v_division_key text;
  v_tier_rank smallint;
  v_keys text[]:=array[]::text[];
  v_license_key text;
begin
  select * into v_member from public.members where id=p_member_id;
  if not found then return v_keys; end if;
  if v_member.role='Driver' then
    v_license_key:=case lower(trim(coalesce(v_member.license,'')))
      when 'bronze' then 'license_bronze'
      when 'silver' then 'license_silver'
      when 'gold' then 'license_gold'
      when 'super license' then 'license_super_license'
      else null end;
    if v_license_key is not null then v_keys:=array_append(v_keys,v_license_key); end if;
    select band into v_band from public.caleris_driver_reputation where member_id=p_member_id;
    if v_band in ('developing','established','competitive','top','elite') then
      v_keys:=array_append(v_keys,'reputation_'||v_band);
    end if;
  end if;
  if v_member.team_id is not null then
    select lower(d.division_key) into v_division_key
    from public.teams t
    join public.license_season_divisions d on lower(d.division_key)=lower(t.division_key)
    join public.license_seasons s on s.id=d.season_id
    where t.id=v_member.team_id
    order by case when s.status='active' then 0 else 1 end,s.created_at desc
    limit 1;
    if v_division_key is not null then
      select tier_rank into v_tier_rank from public.caleris_digital_id_division_tier_map where division_key=v_division_key;
      if v_tier_rank between 1 and 5 then v_keys:=array_append(v_keys,'division_tier_'||v_tier_rank); end if;
    end if;
  end if;
  return v_keys;
end;
$function$;

create or replace function public.caleris_get_digital_id_options()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_member_id uuid:=(select public.caleris_current_member_id());
  v_unlocked text[];
  v_card public.caleris_digital_id_cards%rowtype;
  v_default_template text;
  v_result jsonb;
begin
  if (select auth.uid()) is null or v_member_id is null then raise exception 'member_profile_required'; end if;
  v_unlocked:=private.caleris_digital_id_unlocked_templates(v_member_id);
  select template_key into v_default_template
  from public.caleris_digital_id_templates
  where template_key=any(v_unlocked) and active
  order by sort_order limit 1;
  insert into public.caleris_digital_id_cards(member_id,theme,accent_color,tagline,public_visible)
  values(v_member_id,'classic','#b99752','',false)
  on conflict(member_id) do nothing;
  select * into v_card from public.caleris_digital_id_cards where member_id=v_member_id;
  select jsonb_build_object(
    'templates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'template_key',t.template_key,'title',t.title,'group_key',t.group_key,
        'group_label',case t.group_key when 'license' then 'License' when 'reputation' then 'Reputation' else 'Division' end,
        'layout_variant',t.layout_variant,'accent_color',t.accent_color,
        'unlocked',t.template_key=any(v_unlocked)
      ) order by t.sort_order)
      from public.caleris_digital_id_templates t where t.active
    ),'[]'::jsonb),
    'card',jsonb_build_object(
      'template_key',coalesce(v_card.template_key,v_default_template),
      'tagline',v_card.tagline,
      'public_visible',coalesce(v_card.public_visible,false) and coalesce(v_card.template_key,v_default_template) is not null,
      'selected_badges',coalesce(v_card.selected_badges,'{}'::text[])
    ),
    'earned_badges',coalesce((
      select jsonb_agg(jsonb_build_object('code',b.code,'title',b.title,'category',b.category))
      from public.caleris_member_badges mb
      join public.caleris_achievement_badges b on b.code=mb.badge_code and b.active
      where mb.member_id=v_member_id
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.caleris_save_digital_id_v2(
  p_template_key text,p_tagline text,p_public boolean,p_badge_codes text[] default '{}'::text[]
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_member_id uuid:=(select public.caleris_current_member_id());
  v_unlocked text[];
  v_codes text[]:=coalesce(p_badge_codes,'{}'::text[]);
  v_count integer;
  v_accent text;
  v_group text;
begin
  if (select auth.uid()) is null or v_member_id is null then raise exception 'member_profile_required'; end if;
  if p_tagline is null or length(p_tagline)>80 then raise exception 'tagline_too_long'; end if;
  if cardinality(v_codes)>3 then raise exception 'maximum_three_badges'; end if;
  if cardinality(v_codes)<>cardinality(array(select distinct unnest(v_codes))) then raise exception 'duplicate_badge_selection'; end if;
  v_unlocked:=private.caleris_digital_id_unlocked_templates(v_member_id);
  if p_template_key is null or not (p_template_key=any(v_unlocked)) then raise exception 'digital_id_template_locked'; end if;
  select accent_color,group_key into v_accent,v_group from public.caleris_digital_id_templates where template_key=p_template_key and active;
  if v_accent is null then raise exception 'digital_id_template_unavailable'; end if;
  select count(*) into v_count from public.caleris_member_badges mb
  join public.caleris_achievement_badges b on b.code=mb.badge_code and b.active
  where mb.member_id=v_member_id and mb.badge_code=any(v_codes);
  if v_count<>cardinality(v_codes) then raise exception 'badge_not_earned'; end if;
  insert into public.caleris_digital_id_cards(member_id,theme,accent_color,tagline,public_visible,template_key,selected_badges)
  values(v_member_id,'classic',v_accent,p_tagline,coalesce(p_public,false),p_template_key,v_codes)
  on conflict(member_id) do update set
    accent_color=excluded.accent_color,tagline=excluded.tagline,
    public_visible=excluded.public_visible,template_key=excluded.template_key,
    selected_badges=excluded.selected_badges,updated_at=now();
  return jsonb_build_object('saved',true,'template_key',p_template_key,'public_visible',coalesce(p_public,false));
end;
$function$;

revoke all on function public.caleris_save_digital_id(text,text,text,boolean) from public,anon,authenticated;
update public.caleris_digital_id_cards c
set template_key=(
  select t.template_key from public.caleris_digital_id_templates t
  where t.template_key=any(private.caleris_digital_id_unlocked_templates(c.member_id)) and t.active
  order by t.sort_order limit 1
),
accent_color=(
  select t.accent_color from public.caleris_digital_id_templates t
  where t.template_key=any(private.caleris_digital_id_unlocked_templates(c.member_id)) and t.active
  order by t.sort_order limit 1
)
where c.template_key is null
  and exists(select 1 from public.caleris_digital_id_templates t
    where t.template_key=any(private.caleris_digital_id_unlocked_templates(c.member_id)) and t.active);

revoke all on function public.caleris_get_digital_id_options() from public,anon;
revoke all on function public.caleris_save_digital_id_v2(text,text,boolean,text[]) from public,anon;
grant execute on function public.caleris_get_digital_id_options() to authenticated;
grant execute on function public.caleris_save_digital_id_v2(text,text,boolean,text[]) to authenticated;

revoke all on function private.caleris_achievement_reward_xp(text) from public,anon,authenticated;
revoke all on function private.award_caleris_achievement(uuid,text) from public,anon,authenticated;
revoke all on function private.caleris_award_role_achievement() from public,anon,authenticated;
revoke all on function private.caleris_award_checkin_achievement() from public,anon,authenticated;
revoke all on function private.caleris_award_quest_achievement() from public,anon,authenticated;
revoke all on function private.caleris_award_vote_achievement() from public,anon,authenticated;
revoke all on function private.caleris_award_race_achievements() from public,anon,authenticated;
revoke all on function private.caleris_award_round_achievements() from public,anon,authenticated;
revoke all on function private.caleris_digital_id_unlocked_templates(uuid) from public,anon,authenticated;

create or replace function public.caleris_get_public_digital_id(p_member_code text)
returns jsonb language sql stable security definer set search_path='pg_catalog','public'
as $function$
  select jsonb_build_object(
    'card',jsonb_build_object(
      'theme',card.theme,'accent_color',template.accent_color,'tagline',card.tagline,
      'template_key',card.template_key,'template_title',template.title,'layout_variant',template.layout_variant,
      'selected_badges',card.selected_badges,'updated_at',card.updated_at
    ),
    'member',jsonb_build_object(
      'member_code',m.member_code,'character_name',m.character_name,'role',m.role,
      'license',m.license,'team_name',team.name,'avatar_path',profile.avatar_path,
      'market_value_eur',case when m.role='Driver' then (
        select v.market_value_eur from public.caleris_driver_market_values v where v.member_id=m.id
      ) else null end
    ),
    'progression',jsonb_build_object(
      'xp',coalesce((select sum(x.amount) from public.caleris_xp_ledger x where x.member_id=m.id),0),
      'level',public.caleris_xp_level(coalesce((select sum(x.amount) from public.caleris_xp_ledger x where x.member_id=m.id),0))
    ),
    'milestones',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',d.code,'title',d.title,'description',d.description,'completed_at',mp.completed_at
      ) order by mp.completed_at desc)
      from public.caleris_milestone_progress mp
      join public.caleris_milestone_definitions d on d.id=mp.milestone_id and d.active=true
      where mp.member_id=m.id and mp.completed_at is not null
    ),'[]'::jsonb),
    'badges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',earned.code,'title',earned.title,'description',earned.description,
        'icon',earned.icon,'rarity',earned.rarity,'category',earned.category,'awarded_at',earned.awarded_at
      ) order by earned.awarded_at)
      from (
        select distinct on (b.code) b.code,b.title,b.description,b.icon,b.rarity,b.category,mb.awarded_at
        from public.caleris_member_badges mb
        join public.caleris_achievement_badges b on b.code=mb.badge_code and b.active=true
        where mb.member_id=m.id
        order by b.code,mb.awarded_at asc
      ) earned
    ),'[]'::jsonb)
  )
  from public.members m
  join public.caleris_digital_id_cards card on card.member_id=m.id and card.public_visible=true and card.template_key is not null
  join public.caleris_digital_id_templates template on template.template_key=card.template_key and template.active=true
  left join public.teams team on team.id=m.team_id
  left join public.profiles profile on profile.member_id=m.id
  where p_member_code is not null
    and length(trim(p_member_code)) between 1 and 32
    and upper(m.member_code)=upper(trim(p_member_code))
  limit 1;
$function$;

commit;