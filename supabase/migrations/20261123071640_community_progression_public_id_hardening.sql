begin;

create index if not exists members_member_code_upper_idx
on public.members(upper(member_code));

create or replace function public.caleris_xp_level(p_total bigint)
returns integer language plpgsql immutable set search_path=pg_catalog
as $level_bigint$
declare current_level integer:=0; threshold bigint:=50;
begin
  while current_level<100 and p_total>=threshold loop
    current_level:=current_level+1;
    threshold:=threshold*2;
  end loop;
  return current_level;
end;
$level_bigint$;

create or replace function public.caleris_xp_level(p_total numeric)
returns integer language plpgsql immutable set search_path=pg_catalog
as $level_numeric$
declare current_level integer:=0; threshold numeric:=50;
begin
  while current_level<100 and p_total>=threshold loop
    current_level:=current_level+1;
    threshold:=threshold*2;
  end loop;
  return current_level;
end;
$level_numeric$;

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
is 'Intentional public verification endpoint. Returns only member fields and earned badges when public_visible is true; no wallet, contract, or private profile data.';

commit;
