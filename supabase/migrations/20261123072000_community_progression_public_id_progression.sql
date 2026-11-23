begin;

create or replace function public.caleris_get_public_digital_id(p_member_code text)
returns jsonb language sql stable security definer set search_path=pg_catalog,public
as $public_id$
  select jsonb_build_object(
    'card',jsonb_build_object(
      'theme',card.theme,'accent_color',card.accent_color,'tagline',card.tagline,'updated_at',card.updated_at
    ),
    'member',jsonb_build_object(
      'member_code',m.member_code,'character_name',m.character_name,'role',m.role,
      'license',m.license,'team_name',team.name
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
      select jsonb_agg(jsonb_build_object('code',b.code,'title',b.title,'description',b.description,'icon',b.icon,'rarity',b.rarity,'awarded_at',mb.awarded_at) order by mb.awarded_at)
      from public.caleris_member_badges mb
      join public.caleris_achievement_badges b on b.code=mb.badge_code and b.active=true
      where mb.member_id=m.id
    ),'[]'::jsonb)
  )
  from public.members m
  join public.caleris_digital_id_cards card on card.member_id=m.id and card.public_visible=true
  left join public.teams team on team.id=m.team_id
  where p_member_code is not null
    and length(trim(p_member_code)) between 1 and 32
    and upper(m.member_code)=upper(trim(p_member_code))
  limit 1;
$public_id$;

comment on function public.caleris_get_public_digital_id(text)
is 'Public Digital ID verification endpoint. Returns only explicitly public member identity, progression, earned milestones and badges.';

commit;
