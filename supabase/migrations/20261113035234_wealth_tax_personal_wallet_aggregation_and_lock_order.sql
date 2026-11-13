begin;
alter table public.caleris_tax_rules
  add constraint caleris_tax_rules_driver_transfer_member_scope
  check (tax_type='wealth' or (tax_type='driver_transfer' and tax_scope='member'));

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
    select coalesce(w.member_id,p.member_id) member_id,
      round(sum(w.balance),2)::numeric(20,2) total_balance
    from public.economy_wallet_accounts w
    left join public.profiles p
      on w.account_kind='public_member' and p.user_id=w.profile_user_id
    where w.is_active and (
      (w.account_kind in ('driver','team_owner') and w.member_id is not null)
      or (w.account_kind='public_member' and p.member_id is not null)
    )
    group by coalesce(w.member_id,p.member_id)
    having sum(w.balance)>0
    order by coalesce(w.member_id,p.member_id)
  loop
    select * into v_rule from public.caleris_tax_rules r
    where r.tax_type='wealth' and r.tax_scope='member' and r.is_active
      and v_member.total_balance>r.minimum_base
    order by r.minimum_base desc,r.sort_order desc,r.created_at desc,r.id limit 1;
    if found then
      v_amount:=round(v_member.total_balance*v_rule.rate_percent/100,2);
      insert into public.caleris_wealth_tax_assessments_v2(
        season_id,target_kind,member_id,wallet_balance_snapshot,applied_rate,tax_amount,status
      ) values(
        p_season_id,'member',v_member.member_id,v_member.total_balance,v_rule.rate_percent,v_amount,
        case when v_amount>0 then 'assessed' else 'skipped' end
      )
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
      insert into public.caleris_wealth_tax_assessments_v2(
        season_id,target_kind,team_id,wallet_balance_snapshot,applied_rate,tax_amount,status
      ) values(
        p_season_id,'team',v_team.team_id,v_team.total_balance,v_rule.rate_percent,v_amount,
        case when v_amount>0 then 'assessed' else 'skipped' end
      )
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
  where w.account_kind='vreeo_bank' and w.is_active;
  if v_bank is null then raise exception 'Wallet VreeoBank tidak tersedia.'; end if;

  perform 1
  from public.economy_wallet_accounts w
  where w.id=v_bank
    or exists(
      select 1 from public.caleris_wealth_tax_assessments_v2 a
      where a.season_id=p_season_id and a.status='assessed'
        and (
          (a.target_kind='member' and (
            (w.account_kind in ('driver','team_owner') and w.member_id=a.member_id)
            or (w.account_kind='public_member' and exists(
              select 1 from public.profiles p where p.user_id=w.profile_user_id and p.member_id=a.member_id
            ))
          ))
          or (a.target_kind='team' and w.account_kind='team' and w.team_id=a.team_id)
        )
    )
  order by w.id
  for update;

  for v_assessment in
    select * from public.caleris_wealth_tax_assessments_v2 a
    where a.season_id=p_season_id and a.status='assessed'
    order by a.assessed_at,a.id
    for update
  loop
    v_remaining:=v_assessment.tax_amount;
    if v_remaining<=0 then
      update public.caleris_wealth_tax_assessments_v2 set status='skipped' where id=v_assessment.id;
      v_skipped:=v_skipped+1;
      continue;
    end if;
    if v_assessment.target_kind='member' then
      select coalesce(sum(w.balance),0)::numeric(20,2) into v_total
      from public.economy_wallet_accounts w
      left join public.profiles p
        on w.account_kind='public_member' and p.user_id=w.profile_user_id
      where w.is_active and (
        (w.account_kind in ('driver','team_owner') and w.member_id=v_assessment.member_id)
        or (w.account_kind='public_member' and p.member_id=v_assessment.member_id)
      );
      if v_total<v_remaining then v_insufficient:=v_insufficient+1; continue; end if;
      for v_wallet in
        select w.id,w.balance
        from public.economy_wallet_accounts w
        left join public.profiles p
          on w.account_kind='public_member' and p.user_id=w.profile_user_id
        where w.is_active and w.balance>0 and (
          (w.account_kind in ('driver','team_owner') and w.member_id=v_assessment.member_id)
          or (w.account_kind='public_member' and p.member_id=v_assessment.member_id)
        )
        order by w.id
      loop
        exit when v_remaining<=0;
        v_debit:=least(v_wallet.balance,v_remaining);
        v_result:=private.post_economy_transaction(
          v_wallet.id,v_bank,v_debit,'tax',
          'Wealth Tax · Member · '||v_assessment.member_id::text,
          'wealth-tax:'||v_assessment.id::text||':'||v_wallet.id::text,
          (select auth.uid()),
          jsonb_build_object('assessment_id',v_assessment.id,'target_kind','member','member_id',v_assessment.member_id,'season_id',p_season_id,'applied_rate',v_assessment.applied_rate),
          null,false
        );
        v_tx:=(v_result->>'transaction_id')::uuid;
        insert into public.caleris_wealth_tax_collections_v2(assessment_id,wallet_id,transaction_id,amount)
        values(v_assessment.id,v_wallet.id,v_tx,v_debit)
        on conflict(assessment_id,wallet_id) do nothing;
        v_remaining:=v_remaining-v_debit;
      end loop;
    else
      select w.id,w.balance into v_wallet
      from public.economy_wallet_accounts w
      where w.account_kind='team' and w.team_id=v_assessment.team_id and w.is_active;
      if v_wallet.id is null or v_wallet.balance<v_remaining then
        v_insufficient:=v_insufficient+1;
        continue;
      end if;
      v_result:=private.post_economy_transaction(
        v_wallet.id,v_bank,v_remaining,'tax',
        'Wealth Tax · Team · '||v_assessment.team_id::text,
        'wealth-tax:'||v_assessment.id::text||':'||v_wallet.id::text,
        (select auth.uid()),
        jsonb_build_object('assessment_id',v_assessment.id,'target_kind','team','team_id',v_assessment.team_id,'season_id',p_season_id,'applied_rate',v_assessment.applied_rate),
        null,false
      );
      v_tx:=(v_result->>'transaction_id')::uuid;
      insert into public.caleris_wealth_tax_collections_v2(assessment_id,wallet_id,transaction_id,amount)
      values(v_assessment.id,v_wallet.id,v_tx,v_remaining)
      on conflict(assessment_id,wallet_id) do nothing;
      v_remaining:=0;
    end if;
    if v_remaining>0 then raise exception 'Penagihan Wealth Tax tidak lengkap; transaksi dibatalkan.'; end if;
    update public.caleris_wealth_tax_assessments_v2 set status='paid',paid_at=now() where id=v_assessment.id;
    v_paid:=v_paid+1;
  end loop;
  return jsonb_build_object('season_id',p_season_id,'paid',v_paid,'insufficient_balance',v_insufficient,'skipped',v_skipped);
end;
$$;
commit;
