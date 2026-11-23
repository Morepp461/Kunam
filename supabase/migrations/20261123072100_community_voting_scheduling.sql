begin;

alter table public.caleris_community_polls
  drop constraint if exists caleris_community_polls_status_check;
alter table public.caleris_community_polls
  add constraint caleris_community_polls_status_check
  check(status in('draft','scheduled','open','closed','published'));

drop policy if exists "cp polls read" on public.caleris_community_polls;
create policy "cp polls read" on public.caleris_community_polls
for select to authenticated
using(status in('scheduled','open','closed','published') or created_by=auth.uid()
  or exists(select 1 from public.site_admins where user_id=auth.uid()));

drop policy if exists "cp options read" on public.caleris_community_poll_options;
create policy "cp options read" on public.caleris_community_poll_options
for select to authenticated
using(exists(select 1 from public.caleris_community_polls p
  where p.id=poll_id and p.status in('scheduled','open','closed','published')));

drop function if exists public.caleris_admin_create_poll(text,text,text,timestamptz,jsonb,uuid);
create or replace function public.caleris_admin_create_poll(
  p_title text,p_description text,p_type text,p_starts_at timestamptz,p_ends_at timestamptz,p_options jsonb,p_season_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public
as $create_poll$
declare poll_id uuid; item jsonb; candidate_member uuid; candidate_team uuid; candidate_label text; candidate_key text; is_team_poll boolean; seen_candidates text[]:=array[]::text[];
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
  if jsonb_typeof(p_options) is distinct from 'array'
    or jsonb_array_length(p_options)<2 or jsonb_array_length(p_options)>50 then
    raise exception 'poll_requires_two_to_fifty_options';
  end if;
  is_team_poll:=p_type in('team_of_period','team_of_season');
  insert into public.caleris_community_polls(title,description,poll_type,status,starts_at,ends_at,season_id,created_by)
  values(left(trim(p_title),160),left(coalesce(p_description,''),1000),p_type,case when coalesce(p_starts_at,now())>now() then 'scheduled' else 'open' end,coalesce(p_starts_at,now()),p_ends_at,p_season_id,auth.uid())
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
revoke all on function public.caleris_admin_create_poll(text,text,text,timestamptz,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.caleris_admin_create_poll(text,text,text,timestamptz,timestamptz,jsonb,uuid) to authenticated;

create or replace function public.caleris_cast_community_vote(p_poll_id uuid,p_option_id uuid)
returns void language plpgsql security definer set search_path=public
as $cast_vote$
declare member_id uuid:=public.caleris_current_member_id(); poll public.caleris_community_polls%rowtype;
begin
  if auth.uid() is null or member_id is null then raise exception 'member_profile_required'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id for update;
  if not found then raise exception 'poll_not_open'; end if;
  if poll.status='scheduled' and now()>=poll.starts_at and now()<poll.ends_at then
    update public.caleris_community_polls set status='open' where id=p_poll_id;
    poll.status:='open';
  end if;
  if poll.status<>'open' or now()<poll.starts_at or now()>=poll.ends_at then raise exception 'poll_not_open'; end if;
  if not exists(select 1 from public.caleris_community_poll_options where id=p_option_id and poll_id=p_poll_id) then
    raise exception 'invalid_option';
  end if;
  insert into public.caleris_community_votes(poll_id,voter_member_id,option_id)
  values(p_poll_id,member_id,p_option_id);
  perform public.caleris_log_activity(
    member_id,(select team_id from public.members where id=member_id),
    'community_vote','Member berpartisipasi dalam voting','Suara komunitas telah dicatat.',
    jsonb_build_object('source_id',p_poll_id::text||':'||member_id::text,'poll_id',p_poll_id)
  );
  insert into public.caleris_member_badges(member_id,badge_code,source_type,source_id)
  values(member_id,'community_voice','community_vote',p_poll_id::text)
  on conflict do nothing;
end;
$cast_vote$;
revoke all on function public.caleris_cast_community_vote(uuid,uuid) from public,anon;
grant execute on function public.caleris_cast_community_vote(uuid,uuid) to authenticated;

commit;
