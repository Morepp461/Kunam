begin;

-- Persist a per-account language preference. Existing accounts default to Indonesian.
alter table public.profiles
  add column if not exists preferred_language text not null default 'id';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass
      and conname='profiles_preferred_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_language_check
      check (preferred_language in ('id','en'));
  end if;
end
$$;

comment on column public.profiles.preferred_language is
  'CALERIS MASTERS interface language: id (Indonesian, default) or en (English).';

-- Increase the locked Driver Market Value base without changing any other approved weights.
drop trigger if exists caleris_driver_market_config_immutable
  on public.caleris_driver_market_config;

update public.caleris_driver_market_config
set base_value_eur=18000000,
    updated_at=now(),
    updated_by=null
where id=true;

create trigger caleris_driver_market_config_immutable
before insert or update or delete on public.caleris_driver_market_config
for each row execute function private.guard_driver_market_config_immutable();

-- Recalculate existing snapshots using the existing gradual-growth factor (0.25).
select private.recalculate_driver_market_values(null,'base_value_increase_18m');

-- Expose the same Driver MV value on public Digital ID cards.
create or replace function public.caleris_get_public_digital_id(p_member_code text)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog','public'
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

-- Durable notification deletion tombstones prevent reminder workers from recreating
-- a notification after a member explicitly deletes it.
create table if not exists public.caleris_notification_deletion_tombstones (
  idempotency_key text primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  deleted_at timestamptz not null default now()
);

alter table public.caleris_notification_deletion_tombstones enable row level security;
revoke all on public.caleris_notification_deletion_tombstones from public,anon,authenticated,service_role;

create or replace function private.enqueue_caleris_notification(
  p_member_id uuid,
  p_category text,
  p_title text,
  p_body text,
  p_href text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_member_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_member_id is null or nullif(trim(p_title),'') is null or nullif(trim(p_idempotency_key),'') is null then
    return;
  end if;

  if exists (
    select 1
    from public.caleris_notification_deletion_tombstones t
    where t.idempotency_key=p_idempotency_key
      and t.member_id=p_member_id
  ) then
    return;
  end if;

  insert into public.caleris_notifications(
    member_id,actor_member_id,category,title,body,href,metadata,idempotency_key
  )
  values(
    p_member_id,p_actor_member_id,p_category,p_title,p_body,p_href,
    coalesce(p_metadata,'{}'::jsonb),p_idempotency_key
  )
  on conflict(idempotency_key) do nothing;
end;
$function$;

create or replace function public.member_delete_caleris_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_key text;
begin
  select p.member_id into v_member_id
  from public.profiles p
  where p.user_id=(select auth.uid());

  if v_member_id is null then
    raise exception 'Akun belum terhubung ke member.';
  end if;

  select n.idempotency_key into v_key
  from public.caleris_notifications n
  where n.id=p_notification_id and n.member_id=v_member_id
  for update;

  if not found then return false; end if;

  insert into public.caleris_notification_deletion_tombstones(idempotency_key,member_id)
  values(v_key,v_member_id)
  on conflict(idempotency_key) do nothing;

  delete from public.caleris_notifications
  where id=p_notification_id and member_id=v_member_id;

  return found;
end;
$function$;

create or replace function public.member_delete_caleris_notifications()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_deleted integer:=0;
begin
  select p.member_id into v_member_id
  from public.profiles p
  where p.user_id=(select auth.uid());

  if v_member_id is null then
    raise exception 'Akun belum terhubung ke member.';
  end if;

  insert into public.caleris_notification_deletion_tombstones(idempotency_key,member_id)
  select n.idempotency_key,n.member_id
  from public.caleris_notifications n
  where n.member_id=v_member_id
  on conflict(idempotency_key) do nothing;

  delete from public.caleris_notifications n
  where n.member_id=v_member_id;

  get diagnostics v_deleted=row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.member_delete_caleris_notification(uuid) from public,anon;
revoke all on function public.member_delete_caleris_notifications() from public,anon;
grant execute on function public.member_delete_caleris_notification(uuid) to authenticated;
grant execute on function public.member_delete_caleris_notifications() to authenticated;

-- All deletes must pass through the tombstone RPCs.
revoke delete on table public.caleris_notifications from public,anon,authenticated;

-- Remove only expired quest reminder notifications. Keep all other notification history.
insert into public.caleris_notification_deletion_tombstones(idempotency_key,member_id)
select n.idempotency_key,n.member_id
from public.caleris_notifications n
join public.caleris_quest_assignments a
  on a.id::text=n.metadata->>'assignment_id'
where n.category='quest_reminder'
  and (a.ends_at<now() or a.status in ('completed','expired','cancelled'))
on conflict(idempotency_key) do nothing;

delete from public.caleris_notifications n
using public.caleris_quest_assignments a
where n.category='quest_reminder'
  and a.id::text=n.metadata->>'assignment_id'
  and (a.ends_at<now() or a.status in ('completed','expired','cancelled'));

commit;
