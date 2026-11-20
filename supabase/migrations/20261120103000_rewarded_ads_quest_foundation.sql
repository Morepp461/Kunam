begin;

create table if not exists public.caleris_rewarded_ads_config (
  singleton boolean primary key default true check (singleton),
  is_enabled boolean not null default false,
  provider text not null default 'google_ad_manager' check (provider='google_ad_manager'),
  timezone text not null default 'Asia/Jakarta',
  daily_ad_limit integer not null default 5 check (daily_ad_limit between 1 and 5),
  milestones jsonb not null default '[{"ads":1,"reward":50000},{"ads":3,"reward":160000},{"ads":5,"reward":300000}]'::jsonb
    check (jsonb_typeof(milestones)='array' and jsonb_array_length(milestones)=3),
  gam_network_code text,
  gam_ad_unit_path text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.caleris_rewarded_ads_config(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.caleris_rewarded_ads_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google_ad_manager' check (provider='google_ad_manager'),
  transaction_id text not null unique,
  member_id uuid not null references public.members(id) on delete restrict,
  role_scope text not null check (role_scope in ('driver','team_owner')),
  team_id uuid references public.teams(id) on delete restrict,
  served_at timestamptz not null,
  event_date date not null,
  verification_status text not null default 'verified' check (verification_status in ('verified','rejected')),
  verification_key_id text,
  created_at timestamptz not null default now(),
  constraint caleris_rewarded_ads_event_day check (event_date=(served_at at time zone 'Asia/Jakarta')::date)
);

create index if not exists caleris_rewarded_ads_events_member_day_idx
  on public.caleris_rewarded_ads_events(member_id,event_date,created_at);

create table if not exists public.caleris_rewarded_ads_claims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  role_scope text not null check (role_scope in ('driver','team_owner')),
  team_id uuid references public.teams(id) on delete restrict,
  event_date date not null,
  milestone_ads integer not null check (milestone_ads in (1,3,5)),
  reward_amount numeric(20,2) not null check (reward_amount>0),
  transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint caleris_rewarded_ads_claim_once unique(member_id,event_date,milestone_ads)
);

alter table public.caleris_rewarded_ads_config enable row level security;
alter table public.caleris_rewarded_ads_events enable row level security;
alter table public.caleris_rewarded_ads_claims enable row level security;

revoke all on public.caleris_rewarded_ads_config,public.caleris_rewarded_ads_events,public.caleris_rewarded_ads_claims
  from public,anon,authenticated,service_role;
grant select on public.caleris_rewarded_ads_config to authenticated;
grant select on public.caleris_rewarded_ads_events,public.caleris_rewarded_ads_claims to authenticated;

drop policy if exists caleris_rewarded_ads_config_admin_read on public.caleris_rewarded_ads_config;
create policy caleris_rewarded_ads_config_admin_read on public.caleris_rewarded_ads_config
  for select to authenticated using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

drop policy if exists caleris_rewarded_ads_events_member_read on public.caleris_rewarded_ads_events;
create policy caleris_rewarded_ads_events_member_read on public.caleris_rewarded_ads_events
  for select to authenticated using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_rewarded_ads_events.member_id));

drop policy if exists caleris_rewarded_ads_claims_member_read on public.caleris_rewarded_ads_claims;
create policy caleris_rewarded_ads_claims_member_read on public.caleris_rewarded_ads_claims
  for select to authenticated using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_rewarded_ads_claims.member_id));

create or replace function public.admin_get_rewarded_ads_config()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_user uuid:=(select auth.uid()); v_config public.caleris_rewarded_ads_config%rowtype;
begin
  if v_user is null or not exists(select 1 from public.site_admins a where a.user_id=v_user) then
    raise exception 'Hanya Admin yang dapat mengakses konfigurasi Rewarded Ads.';
  end if;
  select * into v_config from public.caleris_rewarded_ads_config where singleton=true;
  return to_jsonb(v_config);
end;
$function$;

create or replace function public.admin_update_rewarded_ads_config(
  p_is_enabled boolean,
  p_milestones jsonb,
  p_gam_network_code text default null,
  p_gam_ad_unit_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_user uuid:=(select auth.uid()); v_milestones jsonb;
begin
  if v_user is null or not exists(select 1 from public.site_admins a where a.user_id=v_user) then
    raise exception 'Hanya Admin yang dapat mengubah konfigurasi Rewarded Ads.';
  end if;
  if jsonb_typeof(p_milestones)<>'array' or jsonb_array_length(p_milestones)<>3 then
    raise exception 'Konfigurasi milestone harus berisi tepat tiga tingkat.';
  end if;
  if (p_milestones->0->>'ads')::integer<>1 or (p_milestones->1->>'ads')::integer<>3 or (p_milestones->2->>'ads')::integer<>5 then
    raise exception 'Milestone iklan harus 1, 3, dan 5.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_milestones) x where coalesce((x->>'reward')::numeric,0)<=0) then
    raise exception 'Reward setiap milestone harus lebih besar dari nol.';
  end if;
  if p_is_enabled and (nullif(trim(p_gam_network_code),'') is null or nullif(trim(p_gam_ad_unit_path),'') is null) then
    raise exception 'Rewarded Ads tidak dapat diaktifkan sebelum Network Code dan Ad Unit Path GAM tersedia.';
  end if;
  v_milestones:=p_milestones;
  update public.caleris_rewarded_ads_config
  set is_enabled=p_is_enabled,milestones=v_milestones,
      gam_network_code=nullif(trim(p_gam_network_code),''),
      gam_ad_unit_path=nullif(trim(p_gam_ad_unit_path),''),
      updated_by=v_user,updated_at=now()
  where singleton=true;
  return public.admin_get_rewarded_ads_config();
end;
$function$;

create or replace function public.member_get_rewarded_ads_board()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=(select auth.uid());
  v_member public.members%rowtype;
  v_role_scope text;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_count integer:=0;
  v_config public.caleris_rewarded_ads_config%rowtype;
  v_claims jsonb;
  v_rewards jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select m.* into v_member
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=v_user;
  if not found then raise exception 'Karakter member tidak ditemukan.'; end if;
  if v_member.role='Driver' then v_role_scope:='driver';
  elsif v_member.role in ('Owner','Principal') then v_role_scope:='team_owner';
  else raise exception 'Role karakter tidak memenuhi syarat Rewarded Ads.'; end if;

  select * into v_config from public.caleris_rewarded_ads_config where singleton=true;
  select count(*)::integer into v_count
  from public.caleris_rewarded_ads_events e
  where e.member_id=v_member.id and e.event_date=v_today and e.verification_status='verified';

  select coalesce(jsonb_agg(jsonb_build_object(
    'milestone_ads',c.milestone_ads,'reward_amount',c.reward_amount,'transaction_id',c.transaction_id
  ) order by c.milestone_ads),'[]'::jsonb)
  into v_claims
  from public.caleris_rewarded_ads_claims c
  where c.member_id=v_member.id and c.event_date=v_today;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ads',(x->>'ads')::integer,'reward',(x->>'reward')::numeric,
    'claimed',exists(select 1 from public.caleris_rewarded_ads_claims c
      where c.member_id=v_member.id and c.event_date=v_today and c.milestone_ads=(x->>'ads')::integer)
  ) order by (x->>'ads')::integer),'[]'::jsonb)
  into v_rewards from jsonb_array_elements(v_config.milestones) x;

  return jsonb_build_object(
    'enabled',v_config.is_enabled,
    'provider',v_config.provider,
    'timezone',v_config.timezone,
    'daily_limit',v_config.daily_ad_limit,
    'ads_watched',least(v_count,v_config.daily_ad_limit),
    'milestones',v_rewards,
    'claims',v_claims,
    'date',v_today,
    'role_scope',v_role_scope,
    'ready_for_ads',v_config.is_enabled and v_config.gam_network_code is not null and v_config.gam_ad_unit_path is not null
  );
end;
$function$;

revoke all on function public.admin_get_rewarded_ads_config() from public,anon,authenticated,service_role;
revoke all on function public.admin_update_rewarded_ads_config(boolean,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.member_get_rewarded_ads_board() from public,anon,service_role;
grant execute on function public.admin_get_rewarded_ads_config() to authenticated;
grant execute on function public.admin_update_rewarded_ads_config(boolean,jsonb,text,text) to authenticated;
grant execute on function public.member_get_rewarded_ads_board() to authenticated;

grant insert on public.caleris_rewarded_ads_events to service_role;
grant insert on public.caleris_rewarded_ads_claims to service_role;

commit;
