begin;

create table if not exists public.caleris_quest_difficulty_rewards (
  difficulty text primary key check (difficulty in ('easy','normal','hard','elite')),
  reward_amount numeric(20,2) not null check (reward_amount > 0 and reward_amount <= 999999999999999999.99),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.caleris_quest_difficulty_rewards(difficulty,reward_amount)
values ('easy',250),('normal',500),('hard',1000),('elite',2500)
on conflict (difficulty) do nothing;

create table if not exists public.caleris_quest_catalog (
  id uuid primary key default gen_random_uuid(),
  quest_key text not null unique,
  role_scope text not null check (role_scope in ('driver','team_owner')),
  quest_type text not null check (quest_type in ('daily','period')),
  category text not null,
  title text not null,
  description text not null,
  metric_key text not null,
  target_value integer not null check (target_value > 0),
  difficulty text not null references public.caleris_quest_difficulty_rewards(difficulty),
  period_types text[] not null default array['pre_season','race_period','race_break','end_season','off_season']::text[],
  metric_filter jsonb not null default '{}'::jsonb check (jsonb_typeof(metric_filter)='object'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists caleris_quest_catalog_pool_idx
  on public.caleris_quest_catalog(role_scope,quest_type,is_active,sort_order);
create index if not exists caleris_quest_catalog_period_types_idx
  on public.caleris_quest_catalog using gin(period_types);

create table if not exists public.caleris_quest_assignments (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.caleris_quest_catalog(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  season_id uuid references public.license_seasons(id) on delete restrict,
  period_id uuid references public.season_calendar_periods(id) on delete restrict,
  assignment_scope text not null check (assignment_scope in ('daily','period')),
  scope_key text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  assigned_at timestamptz not null default now(),
  progress numeric(20,2) not null default 0 check (progress >= 0),
  status text not null default 'active' check (status in ('active','completed','expired')),
  reward_amount numeric(20,2) not null check (reward_amount >= 0),
  reward_status text not null default 'unpaid' check (reward_status in ('unpaid','pending','paid')),
  reward_transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  completed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint caleris_quest_assignment_window_check check (ends_at > starts_at),
  constraint caleris_quest_assignment_period_shape check (
    (assignment_scope='daily' and period_id is null)
    or (assignment_scope='period' and period_id is not null)
  ),
  constraint caleris_quest_assignment_unique unique(member_id,quest_id,assignment_scope,scope_key)
);

create index if not exists caleris_quest_assignments_member_daily_idx
  on public.caleris_quest_assignments(member_id,scope_key,created_at desc)
  where assignment_scope='daily';
create index if not exists caleris_quest_assignments_member_period_idx
  on public.caleris_quest_assignments(member_id,period_id,created_at desc)
  where assignment_scope='period';
create index if not exists caleris_quest_assignments_pending_reward_idx
  on public.caleris_quest_assignments(created_at)
  where status='completed' and reward_status='pending';

alter table public.caleris_quest_difficulty_rewards enable row level security;
alter table public.caleris_quest_catalog enable row level security;
alter table public.caleris_quest_assignments enable row level security;

revoke all on public.caleris_quest_difficulty_rewards,public.caleris_quest_catalog,public.caleris_quest_assignments
  from public,anon,authenticated,service_role;
grant select,update on public.caleris_quest_difficulty_rewards to authenticated;
grant select on public.caleris_quest_catalog,public.caleris_quest_assignments to authenticated;

drop policy if exists caleris_quest_rewards_admin_read on public.caleris_quest_difficulty_rewards;
create policy caleris_quest_rewards_admin_read on public.caleris_quest_difficulty_rewards
  for select to authenticated
  using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
drop policy if exists caleris_quest_rewards_admin_update on public.caleris_quest_difficulty_rewards;
create policy caleris_quest_rewards_admin_update on public.caleris_quest_difficulty_rewards
  for update to authenticated
  using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
  with check (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

drop policy if exists caleris_quest_catalog_active_read on public.caleris_quest_catalog;
create policy caleris_quest_catalog_active_read on public.caleris_quest_catalog
  for select to authenticated using (is_active);

drop policy if exists caleris_quest_assignments_own_read on public.caleris_quest_assignments;
create policy caleris_quest_assignments_own_read on public.caleris_quest_assignments
  for select to authenticated using (
    exists(
      select 1 from public.profiles p
      where p.user_id=(select auth.uid())
        and p.member_id=caleris_quest_assignments.member_id
    )
  );

create or replace function private.caleris_quest_metric_progress(
  p_member_id uuid,
  p_team_id uuid,
  p_metric_key text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_metric_filter jsonb default '{}'::jsonb
)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_value numeric:=0;
  v_attribute text:=coalesce(p_metric_filter->>'attribute_key','');
begin
  case p_metric_key
    when 'driver_training_completed' then
      select count(*)::numeric into v_value
      from public.caleris_driver_training_attempts a
      where a.member_id=p_member_id and a.status in ('success','failed')
        and a.resolved_at>=p_starts_at and a.resolved_at<p_ends_at;

    when 'driver_training_variety' then
      select count(distinct a.training_key)::numeric into v_value
      from public.caleris_driver_training_attempts a
      where a.member_id=p_member_id and a.status in ('success','failed')
        and a.resolved_at>=p_starts_at and a.resolved_at<p_ends_at;

    when 'driver_training_hard' then
      select count(*)::numeric into v_value
      from public.caleris_driver_training_attempts a
      where a.member_id=p_member_id and a.mode_key='hard'
        and a.status in ('success','failed')
        and a.resolved_at>=p_starts_at and a.resolved_at<p_ends_at;

    when 'driver_training_attribute' then
      select count(*)::numeric into v_value
      from public.caleris_driver_training_attempts a
      join public.caleris_driver_training_catalog c on c.training_key=a.training_key
      where a.member_id=p_member_id and c.attribute_key=v_attribute
        and a.status in ('success','failed')
        and a.resolved_at>=p_starts_at and a.resolved_at<p_ends_at;

    when 'driver_development' then
      select count(*)::numeric into v_value
      from public.caleris_driver_development_history h
      where h.member_id=p_member_id and h.created_at>=p_starts_at and h.created_at<p_ends_at;

    when 'driver_development_attribute' then
      select count(*)::numeric into v_value
      from public.caleris_driver_development_history h
      where h.member_id=p_member_id and h.attribute_key=v_attribute
        and h.created_at>=p_starts_at and h.created_at<p_ends_at;

    when 'race_checkin' then
      select count(*)::numeric into v_value
      from public.caleris_member_race_checkins c
      where c.member_id=p_member_id and c.checkin_at>=p_starts_at and c.checkin_at<p_ends_at;

    when 'team_development' then
      select count(*)::numeric into v_value
      from public.caleris_team_development_part_history h
      where h.team_id=p_team_id and h.created_at>=p_starts_at and h.created_at<p_ends_at;

    when 'team_development_attribute' then
      select count(*)::numeric into v_value
      from public.caleris_team_development_part_history h
      where h.team_id=p_team_id and h.part_key=v_attribute
        and h.created_at>=p_starts_at and h.created_at<p_ends_at;

    when 'team_sponsor_signed' then
      select count(*)::numeric into v_value
      from public.caleris_sponsorship_contracts c
      where c.target_kind='team' and c.target_team_id=p_team_id
        and c.started_at>=p_starts_at and c.started_at<p_ends_at;

    when 'team_job_advert' then
      select count(*)::numeric into v_value
      from public.caleris_job_adverts j
      where j.team_id=p_team_id and j.status='published'
        and j.created_at>=p_starts_at and j.created_at<p_ends_at;

    when 'team_affiliation' then
      select count(*)::numeric into v_value
      from public.caleris_team_affiliations a
      where a.status='accepted' and (a.team_a_id=p_team_id or a.team_b_id=p_team_id)
        and a.updated_at>=p_starts_at and a.updated_at<p_ends_at;

    when 'team_driver_contract' then
      select count(*)::numeric into v_value
      from public.economy_driver_contracts c
      where c.team_id=p_team_id and c.status='active'
        and c.created_at>=p_starts_at and c.created_at<p_ends_at;

    else
      raise exception 'Quest metric tidak dikenal: %',p_metric_key;
  end case;
  return coalesce(v_value,0);
end;
$function$;

revoke all on function private.caleris_quest_metric_progress(uuid,uuid,text,timestamptz,timestamptz,jsonb)
  from public,anon,authenticated,service_role;

insert into public.caleris_quest_catalog
  (quest_key,role_scope,quest_type,category,title,description,metric_key,target_value,difficulty,period_types,metric_filter,sort_order)
values
  ('driver_train_1','driver','daily','Training','Training Routine','Selesaikan satu sesi Driver Training.','driver_training_completed',1,'easy',array['pre_season','race_period','race_break','end_season','off_season'],'{}',10),
  ('driver_train_2','driver','daily','Training','Training Commitment','Selesaikan dua sesi Driver Training.','driver_training_completed',2,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{}',11),
  ('driver_train_3','driver','daily','Training','Training Intensive','Selesaikan tiga sesi Driver Training.','driver_training_completed',3,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',12),
  ('driver_train_variety','driver','daily','Training','Explore The Programme','Selesaikan latihan dari dua program atribut berbeda.','driver_training_variety',2,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{}',13),
  ('driver_train_hard','driver','daily','Training','High Intensity','Selesaikan satu sesi dengan mode Hard.','driver_training_hard',1,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',14),
  ('driver_dev_1','driver','daily','Development','Development Step','Lakukan satu upgrade atribut Driver.','driver_development',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{}',20),
  ('driver_dev_2','driver','daily','Development','Development Push','Lakukan dua upgrade atribut Driver.','driver_development',2,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',21),
  ('driver_train_race_pace','driver','daily','Training','Race Pace Session','Selesaikan program latihan Race Pace.','driver_training_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"race_pace"}',30),
  ('driver_train_qualifying','driver','daily','Training','Qualifying Specialist','Selesaikan program latihan Qualifying Pace.','driver_training_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"qualifying_pace"}',31),
  ('driver_train_experience','driver','daily','Training','Race Intelligence','Selesaikan program latihan Experience.','driver_training_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"experience"}',32),
  ('driver_train_aggression','driver','daily','Training','Controlled Attack','Selesaikan program latihan Aggression.','driver_training_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"aggression"}',33),
  ('driver_train_defence','driver','daily','Training','Hold The Line','Selesaikan program latihan Defensive Strength.','driver_training_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"defensive_strength"}',34),
  ('driver_train_overtake','driver','daily','Training','Passing Academy','Selesaikan program latihan Overtake Skill.','driver_training_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"overtake_skill"}',35),
  ('driver_train_mistake','driver','daily','Training','Precision Protocol','Selesaikan program latihan Mistake Rate.','driver_training_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"mistake_rate"}',36),
  ('driver_train_tyres','driver','daily','Training','Tyre Management Lab','Selesaikan program latihan Tyre Management.','driver_training_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"tyre_management"}',37),
  ('driver_dev_race_pace','driver','daily','Development','Race Pace Upgrade','Upgrade atribut Race Pace.','driver_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"race_pace"}',40),
  ('driver_dev_qualifying','driver','daily','Development','Qualifying Upgrade','Upgrade atribut Qualifying Pace.','driver_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"qualifying_pace"}',41),
  ('driver_dev_experience','driver','daily','Development','Experience Upgrade','Upgrade atribut Experience.','driver_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"experience"}',42),
  ('driver_dev_aggression','driver','daily','Development','Aggression Upgrade','Upgrade atribut Aggression.','driver_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"aggression"}',43),
  ('driver_dev_defence','driver','daily','Development','Defensive Upgrade','Upgrade atribut Defensive Strength.','driver_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"defensive_strength"}',44),
  ('driver_dev_overtake','driver','daily','Development','Overtake Upgrade','Upgrade atribut Overtake Skill.','driver_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"overtake_skill"}',45),
  ('driver_dev_tyres','driver','daily','Development','Tyre Upgrade','Upgrade atribut Tyre Management.','driver_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"tyre_management"}',46),
  ('driver_checkin_daily','driver','daily','Race','Race Attendance','Lakukan Race Check-In saat jendela check-in dibuka.','race_checkin',1,'easy',array['race_period'],'{}',50),

  ('driver_period_train_5','driver','period','Training','Training Commitment','Selesaikan lima sesi Training dalam periode ini.','driver_training_completed',5,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{}',110),
  ('driver_period_train_10','driver','period','Training','Training Dedication','Selesaikan sepuluh sesi Training dalam periode ini.','driver_training_completed',10,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',111),
  ('driver_period_train_variety','driver','period','Training','All-Round Driver','Gunakan empat program latihan atribut berbeda.','driver_training_variety',4,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',112),
  ('driver_period_train_hard','driver','period','Training','Elite Training Block','Selesaikan tiga sesi Training mode Hard.','driver_training_hard',3,'elite',array['pre_season','race_period','race_break','end_season','off_season'],'{}',113),
  ('driver_period_dev_3','driver','period','Development','Development Progress','Lakukan tiga upgrade atribut Driver.','driver_development',3,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{}',120),
  ('driver_period_dev_6','driver','period','Development','Development Momentum','Lakukan enam upgrade atribut Driver.','driver_development',6,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',121),
  ('driver_period_dev_10','driver','period','Development','Driver Development Mastery','Lakukan sepuluh upgrade atribut Driver.','driver_development',10,'elite',array['pre_season','race_period','race_break','end_season','off_season'],'{}',122),
  ('driver_period_dev_race_pace','driver','period','Development','Race Pace Progress','Upgrade Race Pace dua kali dalam periode ini.','driver_development_attribute',2,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"race_pace"}',123),
  ('driver_period_dev_qualifying','driver','period','Development','Qualifying Progress','Upgrade Qualifying Pace dua kali dalam periode ini.','driver_development_attribute',2,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"qualifying_pace"}',124),
  ('driver_period_checkin_3','driver','period','Race','Race Attendance Record','Lakukan tiga Race Check-In dalam Race Periode ini.','race_checkin',3,'normal',array['race_period'],'{}',130),
  ('driver_period_checkin_5','driver','period','Race','Full Race Attendance','Lakukan lima Race Check-In dalam Race Periode ini.','race_checkin',5,'hard',array['race_period'],'{}',131),

  ('team_dev_1','team_owner','daily','Car Development','Technical Update','Lakukan satu upgrade atribut mobil.','team_development',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{}',210),
  ('team_dev_2','team_owner','daily','Car Development','Technical Push','Lakukan dua upgrade atribut mobil.','team_development',2,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',211),
  ('team_dev_engine','team_owner','daily','Car Development','Engine Power Upgrade','Upgrade atribut Engine Power.','team_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"engine_power"}',212),
  ('team_dev_aero','team_owner','daily','Car Development','Aero Package Upgrade','Upgrade atribut Aero Power.','team_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"aero_power"}',213),
  ('team_dev_reliability','team_owner','daily','Car Development','Reliability Upgrade','Upgrade atribut Reliability.','team_development_attribute',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"reliability"}',214),
  ('team_sponsor_1','team_owner','daily','Sponsorship','Sponsor Acquisition','Selesaikan satu kesepakatan sponsor yang tersedia.','team_sponsor_signed',1,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',220),
  ('team_job_advert_1','team_owner','daily','Recruitment','Open Seat','Publikasikan satu lowongan melalui Place Job Advert.','team_job_advert',1,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{}',221),
  ('team_driver_contract_1','team_owner','daily','Recruitment','Driver Signing','Aktifkan satu kontrak Driver untuk tim.','team_driver_contract',1,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',222),
  ('team_affiliation_1','team_owner','daily','Partnership','Affiliate Network','Selesaikan satu perjanjian Affiliate Team.','team_affiliation',1,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',223),
  ('team_checkin_daily','team_owner','daily','Race','Team Race Attendance','Lakukan Race Check-In saat jendela check-in dibuka.','race_checkin',1,'easy',array['race_period'],'{}',230),

  ('team_period_dev_4','team_owner','period','Car Development','Technical Development','Lakukan empat upgrade atribut mobil dalam periode ini.','team_development',4,'normal',array['pre_season','race_period','race_break','end_season','off_season'],'{}',310),
  ('team_period_dev_8','team_owner','period','Car Development','Technical Momentum','Lakukan delapan upgrade atribut mobil dalam periode ini.','team_development',8,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',311),
  ('team_period_dev_12','team_owner','period','Car Development','Technical Mastery','Lakukan dua belas upgrade atribut mobil dalam periode ini.','team_development',12,'elite',array['pre_season','race_period','race_break','end_season','off_season'],'{}',312),
  ('team_period_dev_engine','team_owner','period','Car Development','Powertrain Progress','Upgrade Engine Power dua kali dalam periode ini.','team_development_attribute',2,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{"attribute_key":"engine_power"}',313),
  ('team_period_sponsor_1','team_owner','period','Sponsorship','Sponsorship Growth','Selesaikan satu kontrak sponsor dalam periode ini.','team_sponsor_signed',1,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',320),
  ('team_period_sponsor_2','team_owner','period','Sponsorship','Sponsor Portfolio','Selesaikan dua kontrak sponsor dalam periode ini.','team_sponsor_signed',2,'elite',array['pre_season','race_period','race_break','end_season','off_season'],'{}',321),
  ('team_period_job_advert_2','team_owner','period','Recruitment','Recruitment Drive','Publikasikan dua lowongan melalui Place Job Advert.','team_job_advert',2,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',322),
  ('team_period_driver_contract_1','team_owner','period','Recruitment','Roster Reinforcement','Aktifkan satu kontrak Driver untuk tim.','team_driver_contract',1,'elite',array['pre_season','race_period','race_break','end_season','off_season'],'{}',323),
  ('team_period_affiliation_1','team_owner','period','Partnership','Cross-Division Partnership','Selesaikan satu perjanjian Affiliate Team.','team_affiliation',1,'hard',array['pre_season','race_period','race_break','end_season','off_season'],'{}',324),
  ('team_period_checkin_3','team_owner','period','Race','Team Race Attendance Record','Lakukan tiga Race Check-In dalam Race Periode ini.','race_checkin',3,'normal',array['race_period'],'{}',330)
on conflict (quest_key) do update set
  role_scope=excluded.role_scope,quest_type=excluded.quest_type,category=excluded.category,
  title=excluded.title,description=excluded.description,metric_key=excluded.metric_key,
  target_value=excluded.target_value,difficulty=excluded.difficulty,period_types=excluded.period_types,
  metric_filter=excluded.metric_filter,is_active=true,sort_order=excluded.sort_order,updated_at=now();

create or replace function public.member_get_quest_board()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=(select auth.uid());
  v_member public.members%rowtype;
  v_role_scope text;
  v_day date;
  v_now timestamptz:=clock_timestamp();
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_season_id uuid;
  v_period public.season_calendar_periods%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_wallet_id uuid;
  v_wallet_balance numeric:=0;
  v_bank_id uuid;
  v_assignment record;
  v_progress numeric;
  v_tx jsonb;
  v_daily jsonb;
  v_period_quests jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  select m.* into v_member
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=v_user;
  if not found then raise exception 'Akun belum terhubung ke karakter member.'; end if;

  if v_member.role='Driver' then
    v_role_scope:='driver';
    select id,balance into v_wallet_id,v_wallet_balance
    from public.economy_wallet_accounts
    where account_kind='driver' and member_id=v_member.id and is_active;
  elsif v_member.role in ('Owner','Principal') and v_member.team_id is not null then
    v_role_scope:='team_owner';
    select id,balance into v_wallet_id,v_wallet_balance
    from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_member.team_id and is_active;
  else
    raise exception 'Quest hanya tersedia untuk Driver dan Team Owner yang memiliki tim.';
  end if;

  if v_wallet_id is null then raise exception 'Wallet reward belum tersedia untuk karakter atau tim ini.'; end if;

  v_day:=(v_now at time zone 'Asia/Jakarta')::date;
  v_day_start:=v_day::timestamp at time zone 'Asia/Jakarta';
  v_day_end:=(v_day+1)::timestamp at time zone 'Asia/Jakarta';

  select id into v_season_id
  from public.license_seasons
  where status='active'
  order by starts_on desc nulls last,created_at desc
  limit 1;

  select p.* into v_period
  from public.season_calendar_periods p
  join public.license_seasons s on s.id=p.season_id
  where v_day between p.starts_on and p.ends_on
    and s.status in ('active','completed')
  order by case when s.status='active' then 0 else 1 end,
    s.starts_on desc nulls last,p.sort_order desc
  limit 1;

  if v_period.id is not null then
    v_season_id:=v_period.season_id;
    v_period_start:=v_period.starts_on::timestamp at time zone 'Asia/Jakarta';
    v_period_end:=(v_period.ends_on+1)::timestamp at time zone 'Asia/Jakarta';
  end if;

  if not exists(
    select 1 from public.caleris_quest_assignments a
    where a.member_id=v_member.id and a.assignment_scope='daily' and a.scope_key=v_day::text
  ) then
    insert into public.caleris_quest_assignments(
      quest_id,member_id,team_id,season_id,assignment_scope,scope_key,
      starts_at,ends_at,reward_amount
    )
    select c.id,v_member.id,v_member.team_id,v_season_id,'daily',v_day::text,
      v_day_start,v_day_end,r.reward_amount
    from public.caleris_quest_catalog c
    join public.caleris_quest_difficulty_rewards r on r.difficulty=c.difficulty
    where c.role_scope=v_role_scope and c.quest_type='daily' and c.is_active
      and (
        c.metric_key<>'race_checkin'
        or exists(
          select 1 from public.license_rounds lr
          where lr.status<>'closed' and v_now between lr.checkin_opens_at and lr.checkin_closes_at
        )
      )
      and (
        c.metric_key<>'team_sponsor_signed'
        or exists(
          select 1 from public.caleris_sponsorship_offers o
          where o.target_kind='team' and o.target_team_id=v_member.team_id and o.status='offered'
        )
      )
      and (
        c.metric_key<>'team_driver_contract'
        or (
          (select count(*) from public.economy_driver_contracts dc
            where dc.team_id=v_member.team_id and dc.status='active')<2
          and exists(select 1 from public.members d where d.role='Driver' and d.team_id is null)
        )
      )
      and (
        c.metric_key<>'team_affiliation'
        or (
          not exists(select 1 from public.caleris_team_affiliations af
            where af.status='accepted' and (af.team_a_id=v_member.team_id or af.team_b_id=v_member.team_id))
          and not exists(select 1 from public.caleris_team_affiliations af
            where af.status='pending' and af.requested_by_team_id=v_member.team_id)
        )
      )
      and (
        c.metric_key<>'driver_development_attribute'
        or exists(select 1 from public.caleris_driver_development_attributes da
          where da.member_id=v_member.id and da.attribute_key=c.metric_filter->>'attribute_key'
            and da.current_value<100)
      )
      and (
        c.metric_key<>'team_development_attribute'
        or exists(select 1 from public.caleris_team_development_parts tp
          where tp.team_id=v_member.team_id and tp.part_key=c.metric_filter->>'attribute_key'
            and tp.current_value<100)
      )
    order by random()
    limit 3
    on conflict(member_id,quest_id,assignment_scope,scope_key) do nothing;
  end if;

  if v_period.id is not null and not exists(
    select 1 from public.caleris_quest_assignments a
    where a.member_id=v_member.id and a.assignment_scope='period' and a.period_id=v_period.id
  ) then
    insert into public.caleris_quest_assignments(
      quest_id,member_id,team_id,season_id,period_id,assignment_scope,scope_key,
      starts_at,ends_at,reward_amount
    )
    select c.id,v_member.id,v_member.team_id,v_period.season_id,v_period.id,'period',v_period.id::text,
      v_period_start,v_period_end,r.reward_amount
    from public.caleris_quest_catalog c
    join public.caleris_quest_difficulty_rewards r on r.difficulty=c.difficulty
    where c.role_scope=v_role_scope and c.quest_type='period' and c.is_active
      and c.period_types @> array[v_period.period_type]::text[]
      and (
        c.metric_key<>'race_checkin'
        or exists(select 1 from public.season_period_rounds pr
          join public.license_rounds lr on lr.id=pr.round_id
          where pr.period_id=v_period.id)
      )
      and (
        c.metric_key<>'team_sponsor_signed'
        or exists(select 1 from public.caleris_sponsorship_offers o
          where o.target_kind='team' and o.target_team_id=v_member.team_id and o.status='offered')
      )
      and (
        c.metric_key<>'team_driver_contract'
        or (
          (select count(*) from public.economy_driver_contracts dc
            where dc.team_id=v_member.team_id and dc.status='active')<2
          and exists(select 1 from public.members d where d.role='Driver' and d.team_id is null)
        )
      )
      and (
        c.metric_key<>'team_affiliation'
        or (
          not exists(select 1 from public.caleris_team_affiliations af
            where af.status='accepted' and (af.team_a_id=v_member.team_id or af.team_b_id=v_member.team_id))
          and not exists(select 1 from public.caleris_team_affiliations af
            where af.status='pending' and af.requested_by_team_id=v_member.team_id)
        )
      )
      and (
        c.metric_key<>'driver_development_attribute'
        or exists(select 1 from public.caleris_driver_development_attributes da
          where da.member_id=v_member.id and da.attribute_key=c.metric_filter->>'attribute_key'
            and da.current_value<100)
      )
      and (
        c.metric_key<>'team_development_attribute'
        or exists(select 1 from public.caleris_team_development_parts tp
          where tp.team_id=v_member.team_id and tp.part_key=c.metric_filter->>'attribute_key'
            and tp.current_value<100)
      )
    order by random()
    limit 5
    on conflict(member_id,quest_id,assignment_scope,scope_key) do nothing;
  end if;

  select id into v_bank_id from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active;

  for v_assignment in
    select a.id,a.starts_at,a.ends_at,a.reward_amount,a.reward_status,a.status,
      c.quest_key,c.title,c.metric_key,c.metric_filter,c.target_value,c.difficulty
    from public.caleris_quest_assignments a
    join public.caleris_quest_catalog c on c.id=a.quest_id
    where a.member_id=v_member.id
      and (
        (a.assignment_scope='daily' and a.scope_key=v_day::text)
        or (a.assignment_scope='period' and a.period_id=v_period.id)
      )
    order by a.assignment_scope,a.created_at,a.id
    for update of a
  loop
    v_progress:=private.caleris_quest_metric_progress(
      v_member.id,v_member.team_id,v_assignment.metric_key,
      v_assignment.starts_at,v_assignment.ends_at,v_assignment.metric_filter
    );

    if v_progress>=v_assignment.target_value then
      update public.caleris_quest_assignments
      set progress=v_progress,status='completed',completed_at=coalesce(completed_at,v_now)
      where id=v_assignment.id;

      if v_assignment.reward_status<>'paid' then
        if v_bank_id is null then
          update public.caleris_quest_assignments set reward_status='pending' where id=v_assignment.id;
        else
          v_tx:=private.post_economy_transaction(
            v_bank_id,v_wallet_id,v_assignment.reward_amount,'bank_reward',
            'Quest reward: '||v_assignment.title,
            'quest-reward:'||v_assignment.id::text,
            v_user,
            jsonb_build_object(
              'quest_assignment_id',v_assignment.id,
              'quest_key',v_assignment.quest_key,
              'role_scope',v_role_scope,
              'difficulty',v_assignment.difficulty,
              'source','quest_engine'
            ),
            null,true
          );
          if v_tx is null then
            update public.caleris_quest_assignments set reward_status='pending' where id=v_assignment.id;
          else
            update public.caleris_quest_assignments
            set reward_status='paid',
                reward_transaction_id=(v_tx->>'transaction_id')::uuid,
                paid_at=coalesce(paid_at,v_now)
            where id=v_assignment.id;
          end if;
        end if;
      end if;
    else
      update public.caleris_quest_assignments
      set progress=v_progress,
          status=case when v_now>=v_assignment.ends_at then 'expired' else 'active' end
      where id=v_assignment.id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'quest_key',c.quest_key,'title',c.title,'description',c.description,
    'category',c.category,'difficulty',c.difficulty,'target',c.target_value,
    'progress',a.progress,'status',a.status,'reward_amount',a.reward_amount,
    'reward_status',a.reward_status,'completed_at',a.completed_at,'paid_at',a.paid_at
  ) order by c.sort_order,a.created_at),'[]'::jsonb)
  into v_daily
  from public.caleris_quest_assignments a
  join public.caleris_quest_catalog c on c.id=a.quest_id
  where a.member_id=v_member.id and a.assignment_scope='daily' and a.scope_key=v_day::text;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'quest_key',c.quest_key,'title',c.title,'description',c.description,
    'category',c.category,'difficulty',c.difficulty,'target',c.target_value,
    'progress',a.progress,'status',a.status,'reward_amount',a.reward_amount,
    'reward_status',a.reward_status,'completed_at',a.completed_at,'paid_at',a.paid_at
  ) order by c.sort_order,a.created_at),'[]'::jsonb)
  into v_period_quests
  from public.caleris_quest_assignments a
  join public.caleris_quest_catalog c on c.id=a.quest_id
  where a.member_id=v_member.id and a.assignment_scope='period' and a.period_id=v_period.id;

  select balance into v_wallet_balance from public.economy_wallet_accounts where id=v_wallet_id;

  return jsonb_build_object(
    'member_name',coalesce(v_member.character_name,'Member'),
    'role_scope',v_role_scope,
    'team_id',v_member.team_id,
    'wallet_balance',v_wallet_balance,
    'date',v_day,
    'period',case when v_period.id is null then null else jsonb_build_object(
      'id',v_period.id,'season_id',v_period.season_id,'period_type',v_period.period_type,
      'period_number',v_period.period_number,'title',v_period.title,
      'starts_on',v_period.starts_on,'ends_on',v_period.ends_on
    ) end,
    'daily',v_daily,
    'period_quests',v_period_quests
  );
end;
$function$;

revoke all on function public.member_get_quest_board() from public,anon,service_role;
grant execute on function public.member_get_quest_board() to authenticated;

create or replace function public.admin_process_pending_quest_rewards()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=(select auth.uid());
  v_bank_id uuid;
  v_assignment record;
  v_wallet_id uuid;
  v_tx jsonb;
  v_paid integer:=0;
  v_pending integer:=0;
begin
  if v_user is null or not exists(select 1 from public.site_admins a where a.user_id=v_user) then
    raise exception 'Hanya Admin yang dapat memproses reward Quest.';
  end if;

  select id into v_bank_id from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active;
  if v_bank_id is null then
    return jsonb_build_object('paid',0,'pending',0,'error','VreeoBank tidak tersedia.');
  end if;

  for v_assignment in
    select a.id,a.member_id,a.team_id,a.reward_amount,a.reward_status,
      c.quest_key,c.title,c.role_scope,c.difficulty
    from public.caleris_quest_assignments a
    join public.caleris_quest_catalog c on c.id=a.quest_id
    where a.status='completed' and a.reward_status='pending'
    order by a.created_at,a.id
    for update of a skip locked
  loop
    v_wallet_id:=null;
    if v_assignment.role_scope='driver' then
      select id into v_wallet_id from public.economy_wallet_accounts
      where account_kind='driver' and member_id=v_assignment.member_id and is_active;
    else
      select id into v_wallet_id from public.economy_wallet_accounts
      where account_kind='team' and team_id=v_assignment.team_id and is_active;
    end if;

    if v_wallet_id is null then
      v_pending:=v_pending+1;
      continue;
    end if;

    v_tx:=private.post_economy_transaction(
      v_bank_id,v_wallet_id,v_assignment.reward_amount,'bank_reward',
      'Quest reward: '||v_assignment.title,
      'quest-reward:'||v_assignment.id::text,
      v_user,
      jsonb_build_object(
        'quest_assignment_id',v_assignment.id,
        'quest_key',v_assignment.quest_key,
        'role_scope',v_assignment.role_scope,
        'difficulty',v_assignment.difficulty,
        'source','quest_engine'
      ),
      null,true
    );

    if v_tx is null then
      v_pending:=v_pending+1;
      exit;
    end if;

    update public.caleris_quest_assignments
    set reward_status='paid',
        reward_transaction_id=(v_tx->>'transaction_id')::uuid,
        paid_at=coalesce(paid_at,now())
    where id=v_assignment.id;
    v_paid:=v_paid+1;
  end loop;

  return jsonb_build_object('paid',v_paid,'pending',v_pending);
end;
$function$;

revoke all on function public.admin_process_pending_quest_rewards() from public,anon,service_role;
grant execute on function public.admin_process_pending_quest_rewards() to authenticated;

create or replace function public.fia_create_season_calendar(p_season_id uuid,p_periods jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_period jsonb;
  v_assignment jsonb;
  v_period_id uuid;
  v_type text;
  v_title text;
  v_starts date;
  v_ends date;
  v_number integer;
  v_order integer:=0;
  v_division_id uuid;
  v_round_id uuid;
  v_division_count integer;
  v_type_count integer;
  v_race_count integer:=0;
  v_break_count integer:=0;
  v_period_count integer:=0;
  v_unassigned integer;
  v_previous_end date;
  v_expected text[]:=array[
    'pre_season','race_period','race_break','race_period','race_break',
    'race_period','race_break','race_period','race_break','race_period',
    'end_season','off_season'
  ];
  v_actual text[];
begin
  if not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat membentuk kalender season.'; end if;
  if not exists(select 1 from public.license_seasons where id=p_season_id and status in ('draft','active')) then raise exception 'Season tidak ditemukan atau sudah selesai.'; end if;
  if jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)<>12 then
    raise exception 'Kalender CALERIS wajib memuat tepat 12 periode.';
  end if;
  select array_agg(x->>'period_type' order by ordinality)
  into v_actual
  from jsonb_array_elements(p_periods) with ordinality as p(x,ordinality);
  if v_actual is distinct from v_expected then
    raise exception 'Urutan periode harus Pre Season, lima Race Periode dengan empat Break Balancing di antaranya, End Season, lalu Off Season.';
  end if;
  if exists(select 1 from public.season_calendar_periods where season_id=p_season_id) then raise exception 'Kalender season sudah terbentuk. Gunakan Reschedule untuk mengubah tanggal.'; end if;

  for v_type in select unnest(array['off_season','pre_season','end_season']) loop
    select count(*) into v_type_count from jsonb_array_elements(p_periods) x where x->>'period_type'=v_type;
    if v_type_count<>1 then raise exception 'Kalender wajib memiliki tepat satu periode %.',v_type; end if;
  end loop;
  select count(*) into v_race_count from jsonb_array_elements(p_periods) x where x->>'period_type'='race_period';
  select count(*) into v_break_count from jsonb_array_elements(p_periods) x where x->>'period_type'='race_break';
  if v_race_count<>5 or v_break_count<>4 then raise exception 'Kalender wajib memiliki lima Race Periode dan empat Break Balancing Periode.'; end if;

  select count(*) into v_division_count from public.license_season_divisions where season_id=p_season_id;
  if v_division_count<1 then raise exception 'Buat minimal satu divisi sebelum membentuk kalender.'; end if;

  for v_period in select value from jsonb_array_elements(p_periods) loop
    v_order:=v_order+1;
    v_type:=v_period->>'period_type';
    v_title:=nullif(trim(v_period->>'title'),'');
    v_starts:=(v_period->>'starts_on')::date;
    v_ends:=(v_period->>'ends_on')::date;
    if v_title is null or v_starts is null or v_ends is null or v_ends<v_starts then raise exception 'Nama atau tanggal periode tidak valid.'; end if;
    if v_previous_end is not null and v_starts<=v_previous_end then raise exception 'Tanggal periode harus berurutan dan tidak boleh saling tumpang tindih.'; end if;

    if v_type in ('race_period','race_break') then
      select count(*)+1 into v_number from public.season_calendar_periods
      where season_id=p_season_id and period_type=v_type;
    else v_number:=null; end if;

    insert into public.season_calendar_periods(season_id,period_type,period_number,title,starts_on,ends_on,sort_order,created_by)
    values(p_season_id,v_type,v_number,v_title,v_starts,v_ends,v_order,(select auth.uid()))
    returning id into v_period_id;

    if v_type='race_period' then
      if jsonb_typeof(v_period->'assignments')<>'array' or jsonb_array_length(v_period->'assignments')<>v_division_count
        or (select count(distinct x->>'season_division_id') from jsonb_array_elements(v_period->'assignments') x)<>v_division_count then
        raise exception 'Setiap Race Period wajib mengatur tepat satu daftar round untuk seluruh divisi season.';
      end if;
      for v_assignment in select value from jsonb_array_elements(v_period->'assignments') loop
        v_division_id:=(v_assignment->>'season_division_id')::uuid;
        if not exists(select 1 from public.license_season_divisions where id=v_division_id and season_id=p_season_id) then raise exception 'Divisi tidak termasuk season ini.'; end if;
        if jsonb_typeof(v_assignment->'round_ids')<>'array' or jsonb_array_length(v_assignment->'round_ids') not between 3 and 5 then raise exception 'Setiap Race Period harus berisi 3 sampai 5 round per divisi.'; end if;
        for v_round_id in select value::text::uuid from jsonb_array_elements_text(v_assignment->'round_ids') loop
          insert into public.season_period_rounds(period_id,season_division_id,round_id) values(v_period_id,v_division_id,v_round_id);
        end loop;
      end loop;
    end if;

    v_previous_end:=v_ends;
    v_period_count:=v_period_count+1;
  end loop;

  select count(*) into v_unassigned from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  where d.season_id=p_season_id and not exists(select 1 from public.season_period_rounds pr where pr.round_id=r.id);
  if v_unassigned>0 then raise exception 'Semua round pada seluruh divisi harus dimasukkan ke dalam Race Period. Masih ada % round belum terpetakan.',v_unassigned; end if;

  return jsonb_build_object('season_id',p_season_id,'periods_created',v_period_count,'race_periods',v_race_count,'break_balancing_periods',v_break_count);
end;
$$;

revoke all on function public.fia_create_season_calendar(uuid,jsonb) from public,anon,service_role;
grant execute on function public.fia_create_season_calendar(uuid,jsonb) to authenticated;

commit;