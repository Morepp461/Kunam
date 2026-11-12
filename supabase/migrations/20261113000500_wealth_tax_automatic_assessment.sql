-- Automatically snapshot annual wallet-only Wealth Tax after the final round
alter table public.caleris_wealth_tax_assessments
 add column if not exists calculation_method text not null default 'flat'
 check (calculation_method in ('flat','progressive'));

-- and all payroll claims for the season have settled.
create or replace function private.try_assess_wealth_tax_for_season(p_season_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare
 v_wallet record;v_rule public.caleris_tax_rules%rowtype;v_next numeric;
 v_method text;v_amount numeric;v_effective_rate numeric;v_count integer:=0;
begin
 if p_season_id is null then return 0; end if;
 if exists(select 1 from public.license_rounds r join public.license_season_divisions d on d.id=r.season_division_id where d.season_id=p_season_id and r.status<>'closed') then return 0; end if;
 if exists(select 1 from public.economy_payroll_claims where season_id=p_season_id and status='pending') then return 0; end if;
 select payload->>'method' into v_method from public.caleris_configurations
  where category='economy' and config_key='wealth-tax-calculation' and is_active;
 if v_method not in ('flat','progressive') then return 0; end if;
 for v_wallet in
  select wa.id wallet_id,wa.member_id,wa.balance
  from public.economy_wallet_accounts wa
  join public.members m on m.id=wa.member_id
  where wa.account_kind in ('driver','team_owner') and wa.is_active and wa.balance>0
   and m.role in ('Driver','Owner')
  order by wa.id
 loop
  if exists(select 1 from public.caleris_wealth_tax_assessments where season_id=p_season_id and wallet_id=v_wallet.wallet_id) then continue; end if;
  v_amount:=0;v_effective_rate:=0;
  if v_method='flat' then
   select * into v_rule from public.caleris_tax_rules
    where tax_type='wealth' and is_active and minimum_base<v_wallet.balance
    order by minimum_base desc,sort_order desc,created_at desc limit 1;
   if found then v_amount:=round(v_wallet.balance*v_rule.rate_percent/100,2);v_effective_rate:=v_rule.rate_percent; end if;
  else
   for v_rule in
    select * from public.caleris_tax_rules
    where tax_type='wealth' and is_active and minimum_base<v_wallet.balance
    order by minimum_base,sort_order,created_at
   loop
    select min(minimum_base) into v_next from public.caleris_tax_rules
     where tax_type='wealth' and is_active and minimum_base>v_rule.minimum_base;
    v_amount:=v_amount+(least(v_wallet.balance,coalesce(v_next,v_wallet.balance))-v_rule.minimum_base)*v_rule.rate_percent/100;
   end loop;
   v_amount:=round(v_amount,2);
   if v_wallet.balance>0 then v_effective_rate:=round(v_amount/v_wallet.balance*100,4);end if;
  end if;
  if v_amount<=0 then continue; end if;
  insert into public.caleris_wealth_tax_assessments(season_id,wallet_id,member_id,wallet_balance_snapshot,applied_rate,calculation_method,tax_amount,status)
  values(p_season_id,v_wallet.wallet_id,v_wallet.member_id,v_wallet.balance,v_effective_rate,v_method,v_amount,'assessed')
  on conflict(season_id,wallet_id) do nothing;
  v_count:=v_count+1;
 end loop;
 return v_count;
end;
$$;
revoke all on function private.try_assess_wealth_tax_for_season(uuid) from public,anon,authenticated,service_role;

create or replace function private.auto_assess_wealth_tax_after_round()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_season_id uuid;
begin
 if new.status<>'closed' or (tg_op='UPDATE' and old.status='closed') then return null; end if;
 select d.season_id into v_season_id from public.license_rounds r
 join public.license_season_divisions d on d.id=r.season_division_id where r.id=new.id;
 if v_season_id is not null then perform private.try_assess_wealth_tax_for_season(v_season_id); end if;
 return null;
end;
$$;
revoke all on function private.auto_assess_wealth_tax_after_round() from public,anon,authenticated,service_role;
drop trigger if exists caleris_wealth_tax_after_round on public.license_rounds;
create constraint trigger caleris_wealth_tax_after_round
after update on public.license_rounds
deferrable initially deferred
for each row execute function private.auto_assess_wealth_tax_after_round();

create or replace function private.auto_assess_wealth_tax_after_payroll()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='paid' then perform private.try_assess_wealth_tax_for_season(new.season_id); end if;
 return null;
end;
$$;
revoke all on function private.auto_assess_wealth_tax_after_payroll() from public,anon,authenticated,service_role;
drop trigger if exists caleris_wealth_tax_after_payroll on public.economy_payroll_claims;
create constraint trigger caleris_wealth_tax_after_payroll
after insert or update on public.economy_payroll_claims
deferrable initially deferred
for each row execute function private.auto_assess_wealth_tax_after_payroll();
