begin;
alter table public.caleris_tax_rules
  add column if not exists tax_scope text not null default 'member';
alter table public.caleris_tax_rules
  add constraint caleris_tax_rules_tax_scope_valid
  check (tax_scope in ('member','team'));
create unique index if not exists caleris_tax_rules_wealth_scope_threshold_unique
  on public.caleris_tax_rules(tax_scope,minimum_base)
  where tax_type='wealth';

create table if not exists public.caleris_wealth_tax_assessments_v2 (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  target_kind text not null check (target_kind in ('member','team')),
  member_id uuid references public.members(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  wallet_balance_snapshot numeric not null check (wallet_balance_snapshot>0),
  applied_rate numeric not null check (applied_rate>=0 and applied_rate<=100),
  tax_amount numeric not null check (tax_amount>=0),
  status text not null default 'assessed' check (status in ('assessed','paid','skipped')),
  assessed_at timestamptz not null default now(),
  paid_at timestamptz,
  check (
    (target_kind='member' and member_id is not null and team_id is null)
    or (target_kind='team' and team_id is not null and member_id is null)
  )
);
create unique index if not exists caleris_wealth_tax_v2_member_unique
  on public.caleris_wealth_tax_assessments_v2(season_id,member_id)
  where target_kind='member';
create unique index if not exists caleris_wealth_tax_v2_team_unique
  on public.caleris_wealth_tax_assessments_v2(season_id,team_id)
  where target_kind='team';
create index if not exists caleris_wealth_tax_v2_status_idx
  on public.caleris_wealth_tax_assessments_v2(season_id,status,assessed_at desc);

create table if not exists public.caleris_wealth_tax_collections_v2 (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.caleris_wealth_tax_assessments_v2(id) on delete restrict,
  wallet_id uuid not null references public.economy_wallet_accounts(id) on delete restrict,
  transaction_id uuid not null unique references public.economy_transactions(id) on delete restrict,
  amount numeric not null check (amount>0),
  created_at timestamptz not null default now(),
  unique(assessment_id,wallet_id)
);
create index if not exists caleris_wealth_tax_collections_v2_assessment_idx
  on public.caleris_wealth_tax_collections_v2(assessment_id,created_at);
alter table public.caleris_wealth_tax_assessments_v2 enable row level security;
alter table public.caleris_wealth_tax_collections_v2 enable row level security;
revoke all on public.caleris_wealth_tax_assessments_v2,public.caleris_wealth_tax_collections_v2 from public,anon,authenticated,service_role;
grant select on public.caleris_wealth_tax_assessments_v2,public.caleris_wealth_tax_collections_v2 to authenticated;
create policy "Admins read wealth tax assessments v2"
  on public.caleris_wealth_tax_assessments_v2 for select to authenticated
  using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Admins read wealth tax collections v2"
  on public.caleris_wealth_tax_collections_v2 for select to authenticated
  using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function public.admin_generate_wealth_tax_assessments(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_member record;
  v_team record;
  v_rule public.caleris_tax_rules%rowtype;
  v_amount numeric(20,2);
  v_members integer:=0;
  v_teams integer:=0;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Hanya Admin yang dapat menghitung Wealth Tax.';
  end if;
  if p_season_id is null or not exists(select 1 from public.license_seasons s where s.id=p_season_id) then
    raise exception 'Season tidak ditemukan.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wealth-tax-assessment:'||p_season_id::text,0));
  for v_member in
    select w.member_id,round(sum(w.balance),2)::numeric(20,2) total_balance
    from public.economy_wallet_accounts w
    where w.account_kind in ('driver','team_owner') and w.member_id is not null and w.is_active
    group by w.member_id having sum(w.balance)>0 order by w.member_id
  loop
    select * into v_rule from public.caleris_tax_rules r
    where r.tax_type='wealth' and r.tax_scope='member' and r.is_active
      and v_member.total_balance>r.minimum_base
    order by r.minimum_base desc,r.sort_order desc,r.created_at desc,r.id limit 1;
    if found then
      v_amount:=round(v_member.total_balance*v_rule.rate_percent/100,2);
      insert into public.caleris_wealth_tax_assessments_v2(season_id,target_kind,member_id,wallet_balance_snapshot,applied_rate,tax_amount,status)
      values(p_season_id,'member',v_member.member_id,v_member.total_balance,v_rule.rate_percent,v_amount,
        case when v_amount>0 then 'assessed' else 'skipped' end)
      on conflict(season_id,member_id) where target_kind='member' do nothing;
      if found then v_members:=v_members+1; end if;
    end if;
  end loop;
  for v_team in
    select w.team_id,round(w.balance,2)::numeric(20,2) total_balance
    from public.economy_wallet_accounts w
    where w.account_kind='team' and w.team_id is not null and w.is_active and w.balance>0
    order by w.team_id
  loop
    select * into v_rule from public.caleris_tax_rules r
    where r.tax_type='wealth' and r.tax_scope='team' and r.is_active
      and v_team.total_balance>r.minimum_base
    order by r.minimum_base desc,r.sort_order desc,r.created_at desc,r.id limit 1;
    if found then
      v_amount:=round(v_team.total_balance*v_rule.rate_percent/100,2);
      insert into public.caleris_wealth_tax_assessments_v2(season_id,target_kind,team_id,wallet_balance_snapshot,applied_rate,tax_amount,status)
      values(p_season_id,'team',v_team.team_id,v_team.total_balance,v_rule.rate_percent,v_amount,
        case when v_amount>0 then 'assessed' else 'skipped' end)
      on conflict(season_id,team_id) where target_kind='team' do nothing;
      if found then v_teams:=v_teams+1; end if;
    end if;
  end loop;
  return jsonb_build_object('season_id',p_season_id,'member_assessments_created',v_members,'team_assessments_created',v_teams);
end;
$$;

create or replace function public.admin_collect_wealth_tax(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_assessment public.caleris_wealth_tax_assessments_v2%rowtype;
  v_wallet record;
  v_bank uuid;
  v_total numeric(20,2);
  v_remaining numeric(20,2);
  v_debit numeric(20,2);
  v_result jsonb;
  v_tx uuid;
  v_paid integer:=0;
  v_insufficient integer:=0;
  v_skipped integer:=0;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Hanya Admin yang dapat menagih Wealth Tax.';
  end if;
  if p_season_id is null or not exists(select 1 from public.license_seasons s where s.id=p_season_id) then
    raise exception 'Season tidak ditemukan.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wealth-tax-collection:'||p_season_id::text,0));
  select w.id into v_bank from public.economy_wallet_accounts w
  where w.account_kind='vreeo_bank' and w.is_active for update;
  if v_bank is null then raise exception 'Wallet VreeoBank tidak tersedia.'; end if;
  for v_assessment in
    select * from public.caleris_wealth_tax_assessments_v2 a
    where a.season_id=p_season_id and a.status='assessed'
    order by a.assessed_at,a.id for update
  loop
    v_remaining:=v_assessment.tax_amount;
    if v_remaining<=0 then
      update public.caleris_wealth_tax_assessments_v2 set status='skipped' where id=v_assessment.id;
      v_skipped:=v_skipped+1; continue;
    end if;
    if v_assessment.target_kind='member' then
      perform 1 from public.economy_wallet_accounts w
      where w.member_id=v_assessment.member_id and w.account_kind in ('driver','team_owner') and w.is_active
      order by w.id for update;
      select coalesce(sum(w.balance),0)::numeric(20,2) into v_total
      from public.economy_wallet_accounts w
      where w.member_id=v_assessment.member_id and w.account_kind in ('driver','team_owner') and w.is_active;
      if v_total<v_remaining then v_insufficient:=v_insufficient+1; continue; end if;
      for v_wallet in
        select w.id,w.balance from public.economy_wallet_accounts w
        where w.member_id=v_assessment.member_id and w.account_kind in ('driver','team_owner')
          and w.is_active and w.balance>0 order by w.id
      loop
        exit when v_remaining<=0;
        v_debit:=least(v_wallet.balance,v_remaining);
        v_result:=private.post_economy_transaction(v_wallet.id,v_bank,v_debit,'tax',
          'Wealth Tax · Member · '||v_assessment.member_id::text,
          'wealth-tax:'||v_assessment.id::text||':'||v_wallet.id::text,(select auth.uid()),
          jsonb_build_object('assessment_id',v_assessment.id,'target_kind','member','member_id',v_assessment.member_id,'season_id',p_season_id,'applied_rate',v_assessment.applied_rate),null,false);
        v_tx:=(v_result->>'transaction_id')::uuid;
        insert into public.caleris_wealth_tax_collections_v2(assessment_id,wallet_id,transaction_id,amount)
        values(v_assessment.id,v_wallet.id,v_tx,v_debit) on conflict(assessment_id,wallet_id) do nothing;
        v_remaining:=v_remaining-v_debit;
      end loop;
    else
      select w.id,w.balance into v_wallet from public.economy_wallet_accounts w
      where w.account_kind='team' and w.team_id=v_assessment.team_id and w.is_active for update;
      if v_wallet.id is null or v_wallet.balance<v_remaining then v_insufficient:=v_insufficient+1; continue; end if;
      v_result:=private.post_economy_transaction(v_wallet.id,v_bank,v_remaining,'tax',
        'Wealth Tax · Team · '||v_assessment.team_id::text,
        'wealth-tax:'||v_assessment.id::text||':'||v_wallet.id::text,(select auth.uid()),
        jsonb_build_object('assessment_id',v_assessment.id,'target_kind','team','team_id',v_assessment.team_id,'season_id',p_season_id,'applied_rate',v_assessment.applied_rate),null,false);
      v_tx:=(v_result->>'transaction_id')::uuid;
      insert into public.caleris_wealth_tax_collections_v2(assessment_id,wallet_id,transaction_id,amount)
      values(v_assessment.id,v_wallet.id,v_tx,v_remaining) on conflict(assessment_id,wallet_id) do nothing;
      v_remaining:=0;
    end if;
    if v_remaining>0 then raise exception 'Penagihan Wealth Tax tidak lengkap; transaksi dibatalkan.'; end if;
    update public.caleris_wealth_tax_assessments_v2 set status='paid',paid_at=now() where id=v_assessment.id;
    v_paid:=v_paid+1;
  end loop;
  return jsonb_build_object('season_id',p_season_id,'paid',v_paid,'insufficient_balance',v_insufficient,'skipped',v_skipped);
end;
$$;
revoke all on function public.admin_generate_wealth_tax_assessments(uuid) from public,anon,service_role;
grant execute on function public.admin_generate_wealth_tax_assessments(uuid) to authenticated;
revoke all on function public.admin_collect_wealth_tax(uuid) from public,anon,service_role;
grant execute on function public.admin_collect_wealth_tax(uuid) to authenticated;
commit;
