begin;
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
  v_member_rule_count integer;
  v_team_rule_count integer;
  v_invalid_rate_tiers boolean;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Hanya Admin yang dapat menghitung Wealth Tax.';
  end if;
  if p_season_id is null or not exists(select 1 from public.license_seasons s where s.id=p_season_id) then
    raise exception 'Season tidak ditemukan.';
  end if;
  select count(*) into v_member_rule_count from public.caleris_tax_rules r
  where r.tax_type='wealth' and r.tax_scope='member' and r.is_active;
  select count(*) into v_team_rule_count from public.caleris_tax_rules r
  where r.tax_type='wealth' and r.tax_scope='team' and r.is_active;
  if v_member_rule_count<>3 or v_team_rule_count<>3 then
    raise exception 'Setiap kategori Wealth Tax wajib memiliki tepat 3 aturan aktif.';
  end if;
  select exists(
    select 1 from (
      select r.tax_scope,r.minimum_base,r.rate_percent,
        lag(r.rate_percent) over(partition by r.tax_scope order by r.minimum_base) previous_rate
      from public.caleris_tax_rules r
      where r.tax_type='wealth' and r.is_active
    ) tiers
    where (tiers.previous_rate is null and tiers.rate_percent<=0)
       or (tiers.previous_rate is not null and tiers.rate_percent<=tiers.previous_rate)
  ) into v_invalid_rate_tiers;
  if v_invalid_rate_tiers then
    raise exception 'Tarif Wealth Tax harus meningkat seiring kenaikan ambang pada masing-masing kategori.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wealth-tax-assessment:'||p_season_id::text,0));
  for v_member in
    select coalesce(w.member_id,p.member_id) member_id,round(sum(w.balance),2)::numeric(20,2) total_balance
    from public.economy_wallet_accounts w
    left join public.profiles p on w.account_kind='public_member' and p.user_id=w.profile_user_id
    where w.is_active and (
      (w.account_kind in ('driver','team_owner') and w.member_id is not null)
      or (w.account_kind='public_member' and p.member_id is not null)
    )
    group by coalesce(w.member_id,p.member_id)
    having sum(w.balance)>0
    order by coalesce(w.member_id,p.member_id)
  loop
    select * into v_rule from public.caleris_tax_rules r
    where r.tax_type='wealth' and r.tax_scope='member' and r.is_active and v_member.total_balance>r.minimum_base
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
    where r.tax_type='wealth' and r.tax_scope='team' and r.is_active and v_team.total_balance>r.minimum_base
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
commit;
