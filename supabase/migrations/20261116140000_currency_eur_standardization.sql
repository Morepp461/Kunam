-- CALERIS currency standardization: all active monetary values are EUR.
-- Historical Caleris Pound values are converted at the explicitly agreed rate:
-- 1 ¢p = EUR 2,000. Apply once through this versioned migration.
begin;

-- Temporarily remove only the ledger immutability guards inside this atomic,
-- versioned conversion. They are recreated before commit; all other triggers remain active.
drop trigger if exists economy_transactions_immutable on public.economy_transactions;
drop trigger if exists economy_entries_immutable on public.economy_entries;

-- Wallets and immutable accounting ledger.
update public.economy_wallet_accounts set balance=balance*2000;
update public.economy_transactions set amount=amount*2000;
update public.economy_entries set amount=amount*2000;
update public.economy_payroll_claims set annual_salary=annual_salary*2000, amount=amount*2000;
update public.economy_payroll_claim_splits set amount=amount*2000;
update public.economy_reward_claims set amount=amount*2000;
update public.economy_cash_loans
 set principal=principal*2000, interest_amount=interest_amount*2000,
     total_due=total_due*2000, amount_repaid=amount_repaid*2000;
update public.economy_cash_loan_installments set due_amount=due_amount*2000;
update public.economy_driver_contracts set annual_salary=annual_salary*2000;

-- Legacy compatibility fields and contracts.
update public.members set balance=balance*2000 where balance is not null;
update public.contracts set salary=salary*2000 where salary is not null;
update public.contracts set release_clause=release_clause*2000 where release_clause is not null;

-- Market, tax, penalties, payroll and prizepool.
update public.caleris_driver_move_offers set offered_amount=offered_amount*2000 where offered_amount is not null;
update public.caleris_driver_move_negotiations set agreed_amount=agreed_amount*2000 where agreed_amount is not null;
update public.caleris_fines set amount=amount*2000 where amount is not null;
update public.caleris_member_race_checkins set reward_amount=reward_amount*2000;
update public.caleris_tax_rules set minimum_base=minimum_base*2000;
update public.caleris_inactivity_penalty_rules set team_wallet_fine=team_wallet_fine*2000;
alter table public.caleris_inactivity_penalty_rules alter column team_wallet_fine set default 4000000;

update public.caleris_prizepool_rules set prize_amount=prize_amount*2000;
update public.caleris_prizepool_payouts set prize_amount=prize_amount*2000;

-- Sponsorship and takeover.
update public.caleris_sponsors set available_budget=available_budget*2000 where available_budget is not null;
update public.caleris_sponsorship_contracts set contract_amount=contract_amount*2000;
update public.caleris_sponsorship_offer_revisions set amount=amount*2000;
update public.caleris_sponsorship_offers set proposed_amount=proposed_amount*2000;
update public.caleris_sponsorship_payouts set amount=amount*2000;
update public.caleris_sponsorship_targets set bonus_amount=bonus_amount*2000;
update public.caleris_team_takeover_offers set offered_amount=offered_amount*2000;
update public.caleris_team_takeovers set agreed_amount=agreed_amount*2000;

-- Team valuation components are monetary amounts; team_score remains a score.
update public.caleris_team_valuations set
 assets_value=assets_value*2000,
 development_value=development_value*2000,
 history_value=history_value*2000,
 achievements_value=achievements_value*2000,
 financial_health_value=financial_health_value*2000,
 base_valuation=base_valuation*2000,
 debt_penalty=debt_penalty*2000,
 overdue_penalty=overdue_penalty*2000;

-- Development shop purchase prices are wallet-denominated EUR; token balances and DDP/TDP stay unchanged.
update public.caleris_development_shop_config set token_price=token_price*2000;
update public.caleris_development_shop_purchases
 set unit_price=unit_price*2000,total_price=total_price*2000;

-- Historical wealth-tax snapshots and collections.
update public.caleris_wealth_tax_assessments set
 wallet_balance_snapshot=wallet_balance_snapshot*2000,
 tax_amount=tax_amount*2000;
update public.caleris_wealth_tax_assessments_v2 set
 wallet_balance_snapshot=wallet_balance_snapshot*2000,
 tax_amount=tax_amount*2000;
update public.caleris_wealth_tax_collections_v2 set amount=amount*2000;

-- Restore ledger immutability before the migration commits.
create trigger economy_transactions_immutable before update or delete on public.economy_transactions
for each row execute function private.reject_economy_ledger_mutation();
create trigger economy_entries_immutable before update or delete on public.economy_entries
for each row execute function private.reject_economy_ledger_mutation();

-- Prevent future accidental use of the legacy currency in the database contract.
create table if not exists public.caleris_currency_settings (
  id boolean primary key default true check (id),
  currency_code text not null default 'EUR' check (currency_code='EUR'),
  currency_symbol text not null default '€' check (currency_symbol='€'),
  legacy_caleri_pound_to_eur numeric(20,2) not null default 2000 check (legacy_caleri_pound_to_eur=2000),
  updated_at timestamptz not null default now()
);
insert into public.caleris_currency_settings(id,currency_code,currency_symbol,legacy_caleri_pound_to_eur)
values(true,'EUR','€',2000)
on conflict(id) do update set currency_code='EUR',currency_symbol='€',
 legacy_caleri_pound_to_eur=2000,updated_at=now();
alter table public.caleris_currency_settings enable row level security;
revoke all on public.caleris_currency_settings from public,anon,authenticated;
grant select on public.caleris_currency_settings to authenticated;
drop policy if exists "Authenticated users read currency settings" on public.caleris_currency_settings;
create policy "Authenticated users read currency settings" on public.caleris_currency_settings
 for select to authenticated using (true);

commit;
