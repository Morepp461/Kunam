-- Reconcile existing Admin license/wallet schema drift between Testing and Production.
-- Additive only: preserves the established Bronze-on-role-transition guard and audit schema.

create table if not exists public.caleris_admin_wallet_injections (
  id uuid not null default gen_random_uuid(),
  wallet_account_id uuid not null,
  amount numeric not null,
  bank_funding_transaction_id uuid not null,
  credit_transaction_id uuid not null,
  idempotency_key text not null,
  reason text not null,
  injected_by uuid not null,
  created_at timestamptz not null default now(),
  constraint caleris_admin_wallet_injections_pkey primary key (id),
  constraint caleris_admin_wallet_injections_amount_check check (amount>0),
  constraint caleris_admin_wallet_injections_idempotency_key_check check (length(trim(idempotency_key)) between 8 and 180),
  constraint caleris_admin_wallet_injections_reason_check check (length(trim(reason)) between 3 and 240),
  constraint caleris_admin_wallet_injection_bank_funding_transaction_id_fkey foreign key (bank_funding_transaction_id) references public.economy_transactions(id) on delete restrict,
  constraint caleris_admin_wallet_injections_credit_transaction_id_fkey foreign key (credit_transaction_id) references public.economy_transactions(id) on delete restrict,
  constraint caleris_admin_wallet_injections_injected_by_fkey foreign key (injected_by) references auth.users(id) on delete restrict,
  constraint caleris_admin_wallet_injections_wallet_account_id_fkey foreign key (wallet_account_id) references public.economy_wallet_accounts(id) on delete restrict,
  constraint caleris_admin_wallet_injections_credit_transaction_id_key unique (credit_transaction_id),
  constraint caleris_admin_wallet_injections_idempotency_key_key unique (idempotency_key)
);
alter table public.caleris_admin_wallet_injections enable row level security;
revoke all on public.caleris_admin_wallet_injections from public,anon,authenticated,service_role;
grant select on public.caleris_admin_wallet_injections to authenticated;
grant references,trigger,truncate on public.caleris_admin_wallet_injections to service_role;
drop policy if exists "Site admins read wallet injection audit" on public.caleris_admin_wallet_injections;
create policy "Site admins read wallet injection audit" on public.caleris_admin_wallet_injections
for select to authenticated
using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

drop policy if exists "Site admins read license assignment audit" on public.caleris_admin_license_assignments;
create policy "Site admins read license assignment audit" on public.caleris_admin_license_assignments
for select to authenticated
using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.default_driver_bronze_license()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.role='Driver'
    and nullif(trim(new.license),'') is null
    and exists(
      select 1 from public.caleris_development_license_tier_mapping
      where license_label='Bronze' and license_tier='bronze' and is_active
    ) then
    new.license:='Bronze';
  end if;
  return new;
end;
$$;
drop trigger if exists members_default_bronze_license on public.members;
create trigger members_default_bronze_license
before insert or update of role,license on public.members
for each row execute function private.default_driver_bronze_license();
