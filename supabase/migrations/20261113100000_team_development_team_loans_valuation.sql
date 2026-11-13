-- Team development attributes, configurable upgrade pricing, team liabilities and valuation snapshots.
create table if not exists public.caleris_team_development_parts (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id) on delete cascade,
 part_key text not null check (part_key in (
  'race_pace','qualifying_pace','engine_power','aero_power','low_speed_corners','high_speed_corners',
  'traction','mechanical_grip','team_tyre_management','strategy_quality','team_morale','reliability',
  'car_tyre_wear','pit_stop_efficiency','drs_efficiency','ers_efficiency'
 )),
 current_value numeric(5,2) not null default 50 check (current_value between 50 and 100),
 updated_at timestamptz not null default now(),
 updated_by uuid,
 unique(team_id,part_key)
);
create table if not exists public.caleris_team_development_part_history (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id) on delete cascade,
 part_key text not null,
 previous_value numeric(5,2) not null,
 new_value numeric(5,2) not null check (new_value between 50 and 100),
 tdp_spent numeric(20,2) not null default 0 check (tdp_spent >= 0),
 created_by uuid,
 created_at timestamptz not null default now(),
 note text
);
create table if not exists public.caleris_team_development_pricing (
 part_key text primary key check (part_key in (
  'race_pace','qualifying_pace','engine_power','aero_power','low_speed_corners','high_speed_corners',
  'traction','mechanical_grip','team_tyre_management','strategy_quality','team_morale','reliability',
  'car_tyre_wear','pit_stop_efficiency','drs_efficiency','ers_efficiency'
 )),
 tdp_per_point numeric(20,2) check (tdp_per_point is null or tdp_per_point >= 0),
 is_configured boolean not null default false,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
insert into public.caleris_team_development_pricing(part_key)
select unnest(array['race_pace','qualifying_pace','engine_power','aero_power','low_speed_corners','high_speed_corners','traction','mechanical_grip','team_tyre_management','strategy_quality','team_morale','reliability','car_tyre_wear','pit_stop_efficiency','drs_efficiency','ers_efficiency'])
on conflict(part_key) do nothing;
insert into public.caleris_team_development_parts(team_id,part_key)
select t.id,p.part_key from public.teams t cross join (select unnest(array['race_pace','qualifying_pace','engine_power','aero_power','low_speed_corners','high_speed_corners','traction','mechanical_grip','team_tyre_management','strategy_quality','team_morale','reliability','car_tyre_wear','pit_stop_efficiency','drs_efficiency','ers_efficiency']) part_key) p
on conflict(team_id,part_key) do nothing;

alter table public.economy_cash_loans
 add column if not exists loan_type text not null default 'personal'
 check (loan_type in ('personal','team')),
 add column if not exists team_id uuid references public.teams(id) on delete restrict;
alter table public.economy_cash_loans
 add constraint economy_cash_loans_borrower_scope_check
 check ((loan_type='personal' and team_id is null) or (loan_type='team' and team_id is not null)) not valid;
alter table public.economy_cash_loans validate constraint economy_cash_loans_borrower_scope_check;
create index if not exists economy_cash_loans_team_active_idx
 on public.economy_cash_loans(team_id,status) where loan_type='team';

alter table public.caleris_team_valuations
 add column if not exists base_valuation numeric(20,2),
 add column if not exists team_score numeric(8,4),
 add column if not exists score_breakdown jsonb,
 add column if not exists debt_penalty numeric(8,4),
 add column if not exists overdue_penalty numeric(8,4);
