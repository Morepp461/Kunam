begin;

alter table public.caleris_community_polls
  add column if not exists period_id uuid references public.season_calendar_periods(id) on delete set null,
  add column if not exists period_title_snapshot text;

drop function if exists public.caleris_admin_create_poll(text,text,text,timestamptz,timestamptz,jsonb,uuid);
create or replace function public.caleris_admin_create_poll(
  p_title text,p_description text,p_type text,p_starts_at timestamptz,p_ends_at timestamptz,p_options jsonb,p_season_id uuid default null,p_period_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public
as $create_poll$
declare poll_id uuid; item jsonb; candidate_member uuid; candidate_team uuid; candidate_label text; candidate_key text; is_team_poll boolean; period_title text; seen_candidates text[]:=array[]::text[];
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  if nullif(trim(p_title),'') is null or length(p_title)>160 or length(coalesce(p_description,''))>1000 then
    raise exception 'invalid_poll_text';
  end if;
  if p_type is null or p_type not in('driver_of_period','team_of_period','driver_of_season','team_of_season','fia_nomination') then
    raise exception 'invalid_poll_type';
  end if;
  if p_ends_at is null or p_ends_at<=now() or coalesce(p_starts_at,now())>p_ends_at then raise exception 'invalid_poll_schedule'; end if;
  if p_season_id is not null and not exists(select 1 from public.license_seasons where id=p_season_id) then
    raise exception 'season_not_found';
  end if;
  if p_type in('driver_of_period','team_of_period') then
    if p_season_id is null or p_period_id is null then raise exception 'period_award_requires_season_and_period'; end if;
    select title into period_title from public.season_calendar_periods where id=p_period_id and season_id=p_season_id;
    if not found then raise exception 'period_not_found_for_season'; end if;
  elsif p_type in('driver_of_season','team_of_season') and p_season_id is null then
    raise exception 'season_award_requires_season';
  elsif p_period_id is not null then
    raise exception 'period_not_allowed_for_poll_type';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array'
    or jsonb_array_length(p_options)<2 or jsonb_array_length(p_options)>50 then
    raise exception 'poll_requires_two_to_fifty_options';
  end if;
  is_team_poll:=p_type in('team_of_period','team_of_season');
  insert into public.caleris_community_polls(title,description,poll_type,status,starts_at,ends_at,season_id,period_id,period_title_snapshot,created_by)
  values(left(trim(p_title),160),left(coalesce(p_description,''),1000),p_type,case when coalesce(p_starts_at,now())>now() then 'scheduled' else 'open' end,coalesce(p_starts_at,now()),p_ends_at,p_season_id,p_period_id,period_title,auth.uid())
  returning id into poll_id;
  for item in select value from jsonb_array_elements(p_options) as options(value) loop
    candidate_member:=nullif(item->>'member_id','')::uuid;
    candidate_team:=nullif(item->>'team_id','')::uuid;
    candidate_label:=left(trim(coalesce(item->>'label','')),120);
    if candidate_label='' then raise exception 'candidate_label_required'; end if;
    if is_team_poll then
      if candidate_team is null or candidate_member is not null
        or not exists(select 1 from public.teams where id=candidate_team) then
        raise exception 'invalid_team_candidate';
      end if;
      candidate_key:='team:'||candidate_team::text;
    else
      if candidate_member is null or candidate_team is not null
        or not exists(select 1 from public.members where id=candidate_member) then
        raise exception 'invalid_member_candidate';
      end if;
      if p_type in('driver_of_period','driver_of_season')
        and not exists(select 1 from public.members where id=candidate_member and role='Driver') then
        raise exception 'driver_candidate_required';
      end if;
      candidate_key:='member:'||candidate_member::text;
    end if;
    if candidate_key=any(seen_candidates) then raise exception 'duplicate_poll_candidate'; end if;
    seen_candidates:=array_append(seen_candidates,candidate_key);
    insert into public.caleris_community_poll_options(poll_id,member_id,team_id,label)
    values(poll_id,candidate_member,candidate_team,candidate_label);
  end loop;
  return poll_id;
end;
$create_poll$;
revoke all on function public.caleris_admin_create_poll(text,text,text,timestamptz,timestamptz,jsonb,uuid,uuid) from public,anon;
grant execute on function public.caleris_admin_create_poll(text,text,text,timestamptz,timestamptz,jsonb,uuid,uuid) to authenticated;

commit;
