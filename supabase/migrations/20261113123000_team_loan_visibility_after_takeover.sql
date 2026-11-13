drop policy if exists "Members and Admin read cash loans" on public.economy_cash_loans;
create policy "Members and Admin read cash loans" on public.economy_cash_loans for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=auth.uid())
 or profile_user_id=auth.uid()
 or (loan_type='team' and exists(
   select 1 from public.profiles p join public.members m on m.id=p.member_id
   where p.user_id=auth.uid() and m.team_id=economy_cash_loans.team_id and m.role='Owner'
 ))
);
drop policy if exists "Members and Admin read own loan installments" on public.economy_cash_loan_installments;
create policy "Members and Admin read own loan installments" on public.economy_cash_loan_installments for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=auth.uid())
 or exists(
   select 1 from public.economy_cash_loans l
   where l.id=economy_cash_loan_installments.loan_id
     and (
       l.profile_user_id=auth.uid()
       or (l.loan_type='team' and exists(
         select 1 from public.profiles p join public.members m on m.id=p.member_id
         where p.user_id=auth.uid() and m.team_id=l.team_id and m.role='Owner'
       ))
     )
 )
);
