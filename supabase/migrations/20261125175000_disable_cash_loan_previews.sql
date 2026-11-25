begin;
revoke all on function public.member_cash_loan_preview(uuid) from public,anon,authenticated;
revoke all on function public.member_team_cash_loan_preview(uuid) from public,anon,authenticated;
commit;
