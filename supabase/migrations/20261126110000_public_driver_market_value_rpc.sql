-- Public/member-facing Market Value read paths.
create or replace function public.member_get_driver_market_values()
returns table(member_id uuid, market_value_eur numeric)
language sql
stable
security definer
set search_path to ''
as $function$
  select v.member_id,v.market_value_eur
  from public.caleris_driver_market_values v
  join public.members m on m.id=v.member_id and m.role='Driver'
  order by v.market_value_eur desc
$function$;

create or replace function public.caleris_get_public_driver_market_value(p_member_id uuid)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  select mv.market_value_eur
  from public.members m
  join public.profiles p on p.member_id=m.id
  left join public.caleris_driver_market_values mv on mv.member_id=m.id
  where m.id=p_member_id
    and m.role='Driver'
    and p.account_status in ('public','active','admin')
  limit 1;
$function$;

create or replace function public.caleris_get_public_digital_id(p_member_code text)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select jsonb_build_object(
    'card',jsonb_build_object(
      'theme',card.theme,'accent_color',card.accent_color,'tagline',card.tagline,'updated_at',card.updated_at
    ),
    'member',jsonb_build_object(
      'member_code',m.member_code,'character_name',m.character_name,'role',m.role,
      'license',m.license,'team_name',team.name,
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
        'icon',earned.icon,'rarity',earned.rarity,'awarded_at',earned.awarded_at
      ) order by earned.awarded_at)
      from (
        select distinct on (b.code) b.code,b.title,b.description,b.icon,b.rarity,mb.awarded_at
        from public.caleris_member_badges mb
        join public.caleris_achievement_badges b on b.code=mb.badge_code and b.active=true
        where mb.member_id=m.id
        order by b.code,mb.awarded_at asc
      ) earned
    ),'[]'::jsonb)
  )
  from public.members m
  join public.caleris_digital_id_cards card on card.member_id=m.id and card.public_visible=true
  left join public.teams team on team.id=m.team_id
  where p_member_code is not null
    and length(trim(p_member_code)) between 1 and 32
    and upper(m.member_code)=upper(trim(p_member_code))
  limit 1;
$function$;

revoke all on function public.member_get_driver_market_values() from public, anon, service_role;
grant execute on function public.member_get_driver_market_values() to authenticated;
revoke all on function public.caleris_get_public_driver_market_value(uuid) from public, anon, authenticated;
grant execute on function public.caleris_get_public_driver_market_value(uuid) to service_role;
revoke all on function public.caleris_get_public_digital_id(text) from public;
grant execute on function public.caleris_get_public_digital_id(text) to anon, authenticated;
