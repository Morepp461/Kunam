begin;

-- Wallet adjustments now live only on Driver/Owner/Team profiles and use the
-- dedicated clearing wallet. Disable the legacy Admin injection path because
-- it routes through VreeoBank.
revoke all on function public.admin_inject_wallet_balance(uuid,numeric,text,text)
  from public,anon,authenticated,service_role;

commit;
