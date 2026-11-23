begin;

drop policy if exists "cp badges read" on public.caleris_achievement_badges;
create policy "cp badges read" on public.caleris_achievement_badges
for select to authenticated
using(active or exists(select 1 from public.site_admins where user_id=auth.uid()));

create or replace function public.caleris_admin_save_badge(
  p_code text,p_title text,p_description text,p_icon text,p_rarity text,p_active boolean
) returns void
language plpgsql security definer set search_path=public
as $save_badge$
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then
    raise exception 'not_authorized';
  end if;
  if p_code is null or p_code !~ '^[a-z0-9_]{3,80}$'
    or nullif(trim(p_title),'') is null or length(p_title)>120
    or length(coalesce(p_description,''))>500
    or length(coalesce(p_icon,''))>60
    or p_rarity not in('common','rare','epic','legendary')
    or p_active is null then
    raise exception 'invalid_badge_definition';
  end if;
  insert into public.caleris_achievement_badges(code,title,description,icon,rarity,active)
  values(trim(p_code),trim(p_title),coalesce(trim(p_description),''),coalesce(nullif(trim(p_icon),''),'award'),p_rarity,p_active)
  on conflict(code) do update set
    title=excluded.title,
    description=excluded.description,
    icon=excluded.icon,
    rarity=excluded.rarity,
    active=excluded.active;
end;
$save_badge$;

revoke all on function public.caleris_admin_save_badge(text,text,text,text,text,boolean) from public,anon;
grant execute on function public.caleris_admin_save_badge(text,text,text,text,text,boolean) to authenticated;

commit;
