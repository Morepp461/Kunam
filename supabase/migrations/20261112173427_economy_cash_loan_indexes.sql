-- Indexes for Cash Loan foreign-key lookups and member history.
create index if not exists economy_cash_loans_profile_user_idx on public.economy_cash_loans(profile_user_id);
create index if not exists economy_cash_loans_wallet_idx on public.economy_cash_loans(wallet_id);
create index if not exists economy_cash_loans_origin_season_idx on public.economy_cash_loans(origin_season_id);
create index if not exists economy_cash_loan_installments_season_idx on public.economy_cash_loan_installments(season_id);
create index if not exists economy_cash_loan_installments_period_idx on public.economy_cash_loan_installments(period_id);
