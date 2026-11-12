-- CALERIS Operations Suite foundation.
-- No monetary, tax, prize, sponsor, or valuation amounts are seeded.
-- Operational mutations are exposed only through validated server-side workflows.

alter table public.teams
  add column if not exists division_key text,
  add column if not exists takeover_listed boolean not null default false;

create table if not exists public.caleris_development_accounts (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('DDP','TDP')),
  member_id uuid references public.members(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  balance numeric(20,2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((asset_type='DDP' and member_id is not null and team_id is null)
      or (asset_type='TDP' and team_id is not null and member_id is null))
);
create unique index if not exists caleris_development_member_unique
  on public.caleris_development_accounts(member_id) where asset_type='DDP';
create unique index if not exists caleris_development_team_unique
  on public.caleris_development_accounts(team_id) where asset_type='TDP';

create table if not exists public.caleris_development_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.caleris_development_accounts(id) on delete restrict,
  delta numeric(20,2) not null check (delta <> 0),
  source_type text not null check (source_type in ('race_win','pole_position','quest_reward','admin_adjustment','reversal')),
  source_id uuid,
  idempotency_key text not null unique,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists caleris_development_ledger_account_idx
  on public.caleris_development_ledger(account_id,created_at desc);

create table if not exists public.caleris_race_reward_rules (
  id uuid primary key default gen_random_uuid(),
  season_division_id uuid not null references public.license_season_divisions(id) on delete restrict,
  driver_win_ddp numeric(20,2) not null default 0 check (driver_win_ddp>=0),
  team_win_tdp numeric(20,2) not null default 0 check (team_win_tdp>=0),
  driver_pole_ddp numeric(20,2) not null default 0 check (driver_pole_ddp>=0),
  team_pole_tdp numeric(20,2) not null default 0 check (team_pole_tdp>=0),
  is_active boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(season_division_id)
);

create table if not exists public.caleris_race_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null unique references public.license_rounds(id) on delete restrict,
  winner_member_id uuid not null references public.members(id) on delete restrict,
  pole_member_id uuid not null references public.members(id) on delete restrict,
  entered_by uuid references auth.users(id) on delete set null,
  entered_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.caleris_sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  logo_url text,
  industry text,
  available_budget numeric(20,2) check (available_budget is null or available_budget>=0),
  target_audience jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists caleris_sponsors_name_unique on public.caleris_sponsors(lower(name));

create table if not exists public.caleris_sponsorship_offers (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.caleris_sponsors(id) on delete restrict,
  target_kind text not null check (target_kind in ('driver','team')),
  target_member_id uuid references public.members(id) on delete restrict,
  target_team_id uuid references public.teams(id) on delete restrict,
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  proposed_amount numeric(20,2) not null check (proposed_amount>=0),
  terms jsonb not null default '{}'::jsonb,
  status text not null default 'offered' check (status in ('offered','negotiating','accepted','rejected','expired','withdrawn')),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((target_kind='driver' and target_member_id is not null and target_team_id is null)
      or (target_kind='team' and target_team_id is not null and target_member_id is null))
);
create index if not exists caleris_sponsorship_offers_target_idx
  on public.caleris_sponsorship_offers(target_kind,target_member_id,target_team_id,status);

create table if not exists public.caleris_sponsorship_contracts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.caleris_sponsorship_offers(id) on delete restrict,
  sponsor_id uuid not null references public.caleris_sponsors(id) on delete restrict,
  target_kind text not null check (target_kind in ('driver','team')),
  target_member_id uuid references public.members(id) on delete restrict,
  target_team_id uuid references public.teams(id) on delete restrict,
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  contract_amount numeric(20,2) not null check (contract_amount>=0),
  terms jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','completed','terminated','breached')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((target_kind='driver' and target_member_id is not null and target_team_id is null)
      or (target_kind='team' and target_team_id is not null and target_member_id is null))
);
create index if not exists caleris_sponsorship_contracts_season_idx
  on public.caleris_sponsorship_contracts(season_id,status);

create table if not exists public.caleris_sponsorship_targets (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.caleris_sponsorship_contracts(id) on delete restrict,
  title text not null,
  description text,
  metric_key text not null,
  target_value numeric(20,4) not null,
  current_value numeric(20,4) not null default 0,
  bonus_amount numeric(20,2) not null default 0 check (bonus_amount>=0),
  due_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','achieved','missed','cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.caleris_sponsorship_progress (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.caleris_sponsorship_targets(id) on delete restrict,
  value_delta numeric(20,4) not null,
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.caleris_sponsorship_story_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.caleris_sponsorship_contracts(id) on delete restrict,
  event_type text not null,
  headline text not null,
  body text not null,
  visibility text not null default 'participants' check (visibility in ('participants','public','admin')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.caleris_tax_rules (
  id uuid primary key default gen_random_uuid(),
  tax_type text not null check (tax_type in ('wealth','driver_transfer')),
  label text not null,
  minimum_base numeric(20,2) not null default 0 check (minimum_base>=0),
  rate_percent numeric(7,4) not null check (rate_percent>=0 and rate_percent<=100),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists caleris_tax_rules_lookup_idx
  on public.caleris_tax_rules(tax_type,is_active,minimum_base desc);

create table if not exists public.caleris_wealth_tax_assessments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  wallet_id uuid not null references public.economy_wallet_accounts(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  wallet_balance_snapshot numeric(20,2) not null,
  applied_rate numeric(7,4) not null check (applied_rate>=0 and applied_rate<=100),
  tax_amount numeric(20,2) not null check (tax_amount>=0),
  status text not null default 'assessed' check (status in ('assessed','paid','reversed','skipped')),
  transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  assessed_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(season_id,wallet_id)
);

create table if not exists public.caleris_driver_move_negotiations (
  id uuid primary key default gen_random_uuid(),
  move_type text not null check (move_type in ('transfer','loan')),
  driver_member_id uuid not null references public.members(id) on delete restrict,
  buyer_team_id uuid not null references public.teams(id) on delete restrict,
  seller_team_id uuid not null references public.teams(id) on delete restrict,
  initiated_by uuid not null references public.members(id) on delete restrict,
  agreed_amount numeric(20,2),
  loan_starts_on date,
  loan_ends_on date,
  status text not null default 'offered' check (status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved','rejected','executed','cancelled')),
  total_counteroffers integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_team_id<>seller_team_id),
  check (loan_ends_on is null or loan_starts_on is null or loan_ends_on>loan_starts_on)
);
create index if not exists caleris_driver_move_status_idx
  on public.caleris_driver_move_negotiations(status,created_at desc);

create table if not exists public.caleris_driver_move_offers (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references public.caleris_driver_move_negotiations(id) on delete restrict,
  offered_by_member_id uuid not null references public.members(id) on delete restrict,
  offered_amount numeric(20,2) not null check (offered_amount>=0),
  move_type text not null check (move_type in ('transfer','loan')),
  note text,
  response text not null default 'pending' check (response in ('pending','accepted','countered','rejected','superseded')),
  created_at timestamptz not null default now()
);
create index if not exists caleris_driver_move_offers_history_idx
  on public.caleris_driver_move_offers(negotiation_id,created_at);

create table if not exists public.caleris_team_affiliations (
  id uuid primary key default gen_random_uuid(),
  team_a_id uuid not null references public.teams(id) on delete restrict,
  team_b_id uuid not null references public.teams(id) on delete restrict,
  requested_by_team_id uuid not null references public.teams(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','terminated')),
  agreement jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team_a_id<team_b_id),
  check (requested_by_team_id in (team_a_id,team_b_id)),
  unique(team_a_id,team_b_id)
);
create unique index if not exists caleris_affiliate_team_a_active
  on public.caleris_team_affiliations(team_a_id) where status in ('pending','accepted');
create unique index if not exists caleris_affiliate_team_b_active
  on public.caleris_team_affiliations(team_b_id) where status in ('pending','accepted');

create table if not exists public.caleris_team_valuations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  season_id uuid references public.license_seasons(id) on delete restrict,
  assets_value numeric(20,2) not null default 0 check (assets_value>=0),
  development_value numeric(20,2) not null default 0 check (development_value>=0),
  history_value numeric(20,2) not null default 0 check (history_value>=0),
  achievements_value numeric(20,2) not null default 0 check (achievements_value>=0),
  financial_health_value numeric(20,2) not null default 0 check (financial_health_value>=0),
  total_valuation numeric(20,2) generated always as (assets_value+development_value+history_value+achievements_value+financial_health_value) stored,
  notes text,
  assessed_by uuid references auth.users(id) on delete set null,
  assessed_at timestamptz not null default now()
);
create index if not exists caleris_team_valuations_team_idx
  on public.caleris_team_valuations(team_id,assessed_at desc);

create table if not exists public.caleris_team_takeovers (
  id uuid primary key default gen_random_uuid(),
  target_team_id uuid not null references public.teams(id) on delete restrict,
  buyer_member_id uuid not null references public.members(id) on delete restrict,
  seller_member_id uuid not null references public.members(id) on delete restrict,
  valuation_id uuid not null references public.caleris_team_valuations(id) on delete restrict,
  agreed_amount numeric(20,2),
  status text not null default 'offered' check (status in ('offered','negotiating','seller_accepted','pending_fia','approved','rejected','completed','cancelled')),
  total_counteroffers integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_member_id<>seller_member_id)
);
create table if not exists public.caleris_team_takeover_offers (
  id uuid primary key default gen_random_uuid(),
  takeover_id uuid not null references public.caleris_team_takeovers(id) on delete restrict,
  offered_by_member_id uuid not null references public.members(id) on delete restrict,
  offered_amount numeric(20,2) not null check (offered_amount>=0),
  response text not null default 'pending' check (response in ('pending','accepted','countered','rejected','superseded')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.caleris_fines (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('member','team')),
  target_member_id uuid references public.members(id) on delete restrict,
  target_team_id uuid references public.teams(id) on delete restrict,
  amount numeric(20,2) not null check (amount>0),
  regulation_reference text,
  reason text not null,
  transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  issued_by uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  check ((target_kind='member' and target_member_id is not null and target_team_id is null)
      or (target_kind='team' and target_team_id is not null and target_member_id is null))
);

create table if not exists public.caleris_member_race_checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  round_id uuid not null references public.license_rounds(id) on delete restrict,
  checkin_at timestamptz not null default now(),
  reward_amount numeric(20,2) not null default 0 check (reward_amount>=0),
  reward_status text not null default 'not_configured' check (reward_status in ('not_configured','pending','paid','reversed')),
  reward_transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  unique(member_id,round_id)
);

-- Read access is intentionally narrow. All operational writes must use validated RPCs.
alter table public.caleris_development_accounts enable row level security;
alter table public.caleris_development_ledger enable row level security;
alter table public.caleris_race_reward_rules enable row level security;
alter table public.caleris_race_results enable row level security;
alter table public.caleris_sponsors enable row level security;
alter table public.caleris_sponsorship_offers enable row level security;
alter table public.caleris_sponsorship_contracts enable row level security;
alter table public.caleris_sponsorship_targets enable row level security;
alter table public.caleris_sponsorship_progress enable row level security;
alter table public.caleris_sponsorship_story_events enable row level security;
alter table public.caleris_tax_rules enable row level security;
alter table public.caleris_wealth_tax_assessments enable row level security;
alter table public.caleris_driver_move_negotiations enable row level security;
alter table public.caleris_driver_move_offers enable row level security;
alter table public.caleris_team_affiliations enable row level security;
alter table public.caleris_team_valuations enable row level security;
alter table public.caleris_team_takeovers enable row level security;
alter table public.caleris_team_takeover_offers enable row level security;
alter table public.caleris_fines enable row level security;
alter table public.caleris_member_race_checkins enable row level security;

revoke all on public.caleris_development_accounts,public.caleris_development_ledger,
 public.caleris_race_reward_rules,public.caleris_race_results,public.caleris_sponsors,
 public.caleris_sponsorship_offers,public.caleris_sponsorship_contracts,public.caleris_sponsorship_targets,
 public.caleris_sponsorship_progress,public.caleris_sponsorship_story_events,public.caleris_tax_rules,
 public.caleris_wealth_tax_assessments,public.caleris_driver_move_negotiations,public.caleris_driver_move_offers,
 public.caleris_team_affiliations,public.caleris_team_valuations,public.caleris_team_takeovers,
 public.caleris_team_takeover_offers,public.caleris_fines,public.caleris_member_race_checkins
 from public,anon,authenticated,service_role;
grant select on public.caleris_development_accounts,public.caleris_development_ledger,
 public.caleris_race_reward_rules,public.caleris_race_results,public.caleris_sponsors,
 public.caleris_sponsorship_offers,public.caleris_sponsorship_contracts,public.caleris_sponsorship_targets,
 public.caleris_sponsorship_progress,public.caleris_sponsorship_story_events,public.caleris_tax_rules,
 public.caleris_wealth_tax_assessments,public.caleris_driver_move_negotiations,public.caleris_driver_move_offers,
 public.caleris_team_affiliations,public.caleris_team_valuations,public.caleris_team_takeovers,
 public.caleris_team_takeover_offers,public.caleris_fines,public.caleris_member_race_checkins to authenticated;

create policy "Development accounts visible to their entity or Admin"
on public.caleris_development_accounts for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 or (member_id is not null and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_development_accounts.member_id))
 or (team_id is not null and exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.team_id=caleris_development_accounts.team_id))
);
create policy "Development ledger visible to entity or Admin"
on public.caleris_development_ledger for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 or exists(select 1 from public.caleris_development_accounts d join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=d.member_id where d.id=caleris_development_ledger.account_id)
 or exists(select 1 from public.caleris_development_accounts d join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id and m.team_id=d.team_id where d.id=caleris_development_ledger.account_id)
);
create policy "Race reward configuration visible to Admin and FIA"
on public.caleris_race_reward_rules for select to authenticated using (public.is_caleris_fia_or_admin());
create policy "Race results visible to authenticated"
on public.caleris_race_results for select to authenticated using (true);
create policy "Sponsors visible to authenticated"
on public.caleris_sponsors for select to authenticated using (is_active or public.is_caleris_fia_or_admin());
create policy "Sponsorship offers visible to participants and Admin"
on public.caleris_sponsorship_offers for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=target_member_id)
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.team_id=target_team_id)
);
create policy "Sponsorship contracts visible to participants and Admin"
on public.caleris_sponsorship_contracts for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=target_member_id)
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.team_id=target_team_id)
);
create policy "Sponsorship targets visible to participants and Admin"
on public.caleris_sponsorship_targets for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=c.target_member_id where c.id=contract_id)
 or exists(select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id and m.team_id=c.target_team_id where c.id=contract_id)
);
create policy "Sponsorship progress visible to participants and Admin"
on public.caleris_sponsorship_progress for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.caleris_sponsorship_targets t join public.caleris_sponsorship_contracts c on c.id=t.contract_id join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=c.target_member_id where t.id=target_id)
 or exists(select 1 from public.caleris_sponsorship_targets t join public.caleris_sponsorship_contracts c on c.id=t.contract_id join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id and m.team_id=c.target_team_id where t.id=target_id)
);
create policy "Sponsorship story events visible by visibility and participant"
on public.caleris_sponsorship_story_events for select to authenticated using (
 public.is_caleris_fia_or_admin() or visibility='public'
 or exists(select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=c.target_member_id where c.id=contract_id)
 or exists(select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id and m.team_id=c.target_team_id where c.id=contract_id)
);
create policy "Tax rules visible to Admin"
on public.caleris_tax_rules for select to authenticated using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Wealth assessments visible to member and Admin"
on public.caleris_wealth_tax_assessments for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_wealth_tax_assessments.member_id)
);
create policy "Driver move negotiations visible to participants and FIA"
on public.caleris_driver_move_negotiations for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=driver_member_id)
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.team_id in (buyer_team_id,seller_team_id))
);
create policy "Driver move offers visible to negotiation participants"
on public.caleris_driver_move_offers for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.caleris_driver_move_negotiations n join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=n.driver_member_id where n.id=negotiation_id)
 or exists(select 1 from public.caleris_driver_move_negotiations n join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id and m.team_id in (n.buyer_team_id,n.seller_team_id) where n.id=negotiation_id)
);
create policy "Affiliations visible to member teams and Admin"
on public.caleris_team_affiliations for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.team_id in (team_a_id,team_b_id))
);
create policy "Team valuations visible to team owners and Admin"
on public.caleris_team_valuations for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.team_id=caleris_team_valuations.team_id)
);
create policy "Team takeovers visible to participants and Admin"
on public.caleris_team_takeovers for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id in (buyer_member_id,seller_member_id))
);
create policy "Team takeover offers visible to participants"
on public.caleris_team_takeover_offers for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.caleris_team_takeovers t join public.profiles p on p.user_id=(select auth.uid()) and p.member_id in (t.buyer_member_id,t.seller_member_id) where t.id=takeover_id)
);
create policy "Fines visible to target and FIA"
on public.caleris_fines for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or (target_member_id is not null and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=target_member_id))
 or (target_team_id is not null and exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.team_id=target_team_id))
);
create policy "Race checkins visible to member and Admin"
on public.caleris_member_race_checkins for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_member_race_checkins.member_id)
);
