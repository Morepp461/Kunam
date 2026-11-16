begin;

create or replace function public.fia_submit_race_classification(
  p_round_id uuid,
  p_entries jsonb,
  p_driver_of_day_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_round public.license_rounds%rowtype;
  v_division public.license_season_divisions%rowtype;
  v_entry jsonb;
  v_member_id uuid;
  v_team_id uuid;
  v_status text;
  v_position integer;
  v_grid integer;
  v_finish_ms integer;
  v_fastest_ms integer;
  v_pole_id uuid;
  v_winner_id uuid;
  v_fastest_driver uuid;
  v_fastest_time integer;
  v_count integer;
  v_registered integer;
  v_points numeric;
  v_previous numeric;
  v_cumulative numeric;
  v_result jsonb;
  v_payroll jsonb;
  v_repayments jsonb;
  v_finalized jsonb;
  v_payout jsonb;
  v_tax_assessment jsonb;
  v_tax_collection jsonb;
  v_has_wdc boolean;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat mengesahkan hasil race.';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries)=0 then
    raise exception 'Data klasifikasi race wajib berupa daftar Driver.';
  end if;
  select * into v_round from public.license_rounds where id=p_round_id for update;
  if not found or v_round.status='closed' then raise exception 'Round tidak tersedia atau sudah ditutup.'; end if;
  if v_round.checkin_closes_at > now() then raise exception 'Race hanya dapat disahkan setelah periode check-in berakhir.'; end if;
  if exists(select 1 from public.license_rounds p where p.season_division_id=v_round.season_division_id and p.round_number<v_round.round_number and p.status<>'closed') then
    raise exception 'Round harus disahkan secara berurutan.';
  end if;
  select * into v_division from public.license_season_divisions where id=v_round.season_division_id;
  select count(*) into v_registered from public.license_season_members where season_division_id=v_round.season_division_id and not is_hiatus;
  if jsonb_array_length(p_entries)<>v_registered then
    raise exception 'Klasifikasi harus memuat seluruh Driver aktif yang terdaftar (%).',v_registered;
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_entries) as x(member_id uuid)
    group by member_id having count(*)>1
  ) then raise exception 'Driver duplikat ditemukan.'; end if;

  select x.member_id into v_pole_id
  from jsonb_to_recordset(p_entries) as x(member_id uuid,grid_position integer)
  where x.grid_position=1;
  if v_pole_id is null then raise exception 'Grid position P1 wajib diisi untuk menentukan Pole Position.'; end if;
  select x.member_id into v_winner_id
  from jsonb_to_recordset(p_entries) as x(member_id uuid,finish_status text,finishing_position integer)
  where x.finish_status='finished' and x.finishing_position=1;
  if v_winner_id is null then raise exception 'Harus ada tepat satu pemenang dengan posisi P1.'; end if;
  if (select count(*) from jsonb_to_recordset(p_entries) as x(member_id uuid,finish_status text,finishing_position integer) where x.finish_status='finished' and x.finishing_position=1)<>1 then
    raise exception 'Posisi P1 hanya boleh dimiliki satu Driver.';
  end if;
  if p_driver_of_day_member_id is null then raise exception 'Driver of the Day wajib dipilih.'; end if;
  if p_driver_of_day_member_id is not null and not exists (
    select 1 from jsonb_to_recordset(p_entries) as x(member_id uuid) where x.member_id=p_driver_of_day_member_id
  ) then raise exception 'Driver of the Day harus berasal dari klasifikasi race ini.'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_entries) as x(member_id uuid,grid_position integer,finish_status text,finishing_position integer,finish_time_ms integer,fastest_lap_ms integer,stints jsonb)
    left join public.license_season_members sm on sm.member_id=x.member_id and sm.season_division_id=v_round.season_division_id and not sm.is_hiatus
    left join public.members m on m.id=x.member_id
    where sm.id is null or m.role is distinct from 'Driver'
      or x.grid_position is null or x.grid_position<1
      or x.finish_status not in ('finished','dnf','dns','dsq')
      or (x.finish_status='finished' and (x.finishing_position is null or x.finishing_position<1 or x.finish_time_ms is null or x.finish_time_ms<1))
      or (x.finish_status<>'finished' and x.finishing_position is not null)
      or (x.fastest_lap_ms is not null and x.fastest_lap_ms<1)
      or jsonb_typeof(coalesce(x.stints,'[]'::jsonb))<>'array'
      or jsonb_array_length(coalesce(x.stints,'[]'::jsonb))=0
      or exists(select 1 from jsonb_array_elements_text(coalesce(x.stints,'[]'::jsonb)) s(value) where s.value not in ('soft','medium','hard','intermediate','wet'))
  ) then raise exception 'Ada data Driver, waktu, status, atau compound ban yang tidak valid.'; end if;
  if (select count(distinct x.grid_position) from jsonb_to_recordset(p_entries) as x(grid_position integer))<>v_registered then
    raise exception 'Grid position harus unik untuk seluruh Driver.';
  end if;
  if (select count(distinct x.finishing_position) from jsonb_to_recordset(p_entries) as x(finish_status text,finishing_position integer) where x.finish_status='finished')<>
     (select count(*) from jsonb_to_recordset(p_entries) as x(finish_status text) where x.finish_status='finished') then
    raise exception 'Finishing position tidak boleh duplikat.';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_entries) as x(finish_status text,finishing_position integer) where x.finish_status='finished' and x.finishing_position>(select count(*) from jsonb_to_recordset(p_entries) y where y.finish_status='finished')) then
    raise exception 'Finishing position harus berurutan tanpa celah.';
  end if;

  select x.member_id,x.fastest_lap_ms into v_fastest_driver,v_fastest_time
  from jsonb_to_recordset(p_entries) as x(member_id uuid,fastest_lap_ms integer)
  where x.fastest_lap_ms is not null order by x.fastest_lap_ms limit 1;
  if v_fastest_driver is null then raise exception 'Fastest lap wajib dicatat untuk minimal satu Driver.'; end if;

  delete from public.caleris_race_stints where round_id=p_round_id;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_member_id:=(v_entry->>'member_id')::uuid;
    select team_id into v_team_id from public.members where id=v_member_id;
    v_status:=v_entry->>'finish_status';
    v_position:=nullif(v_entry->>'finishing_position','')::integer;
    v_grid:=(v_entry->>'grid_position')::integer;
    v_finish_ms:=nullif(v_entry->>'finish_time_ms','')::integer;
    v_fastest_ms:=nullif(v_entry->>'fastest_lap_ms','')::integer;
    insert into public.caleris_race_result_entries(round_id,member_id,team_id,finish_status,finishing_position,note,fastest_lap_ms,recorded_by,recorded_at,grid_position,finish_time_ms,gap_ms)
    values(p_round_id,v_member_id,v_team_id,v_status,v_position,nullif(v_entry->>'note',''),v_fastest_ms,(select auth.uid()),now(),v_grid,v_finish_ms,
      case when v_status='finished' then greatest(0,v_finish_ms-(select (x->>'finish_time_ms')::integer from jsonb_array_elements(p_entries) as x(value) where x.value->>'finishing_position'='1' limit 1)) else null end)
    on conflict(round_id,member_id) do update set team_id=excluded.team_id,finish_status=excluded.finish_status,finishing_position=excluded.finishing_position,
      note=excluded.note,fastest_lap_ms=excluded.fastest_lap_ms,recorded_by=excluded.recorded_by,recorded_at=now(),
      grid_position=excluded.grid_position,finish_time_ms=excluded.finish_time_ms,gap_ms=excluded.gap_ms;
    insert into public.caleris_race_stints(round_id,member_id,stint_number,tyre_compound)
    select p_round_id,v_member_id,ordinality,value from jsonb_array_elements_text(coalesce(v_entry->'stints','[]'::jsonb)) with ordinality;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_member_id:=(v_entry->>'member_id')::uuid;
    v_position:=nullif(v_entry->>'finishing_position','')::integer;
    v_points:=0;
    if v_position is not null then
      select coalesce(points,0) into v_points from public.caleris_race_points_rules
      where session_type=v_round.session_type and finishing_position=v_position and is_active;
      v_points:=coalesce(v_points,0);
    end if;
    if v_member_id=v_pole_id then
      select v_points+coalesce(max(pole_bonus),0) into v_points from public.caleris_race_points_rules where session_type=v_round.session_type and is_active;
    end if;
    select coalesce((select points_total from public.license_round_standings rs join public.license_rounds pr on pr.id=rs.round_id
      where rs.member_id=v_member_id and pr.season_division_id=v_round.season_division_id and pr.round_number<v_round.round_number
      order by pr.round_number desc limit 1),0) into v_previous;
    v_cumulative:=v_previous+v_points;
    insert into public.license_round_standings(round_id,member_id,points_total,updated_by)
    values(p_round_id,v_member_id,v_cumulative,(select auth.uid()))
    on conflict(round_id,member_id) do update set points_total=excluded.points_total,updated_by=excluded.updated_by,updated_at=now();
  end loop;

  v_result:=public.process_license_round(p_round_id);
  perform public.fia_record_race_result(p_round_id,v_winner_id,v_pole_id);
  update public.caleris_race_results set driver_of_day_member_id=p_driver_of_day_member_id,
    fastest_lap_member_id=v_fastest_driver,fastest_lap_ms=v_fastest_time where round_id=p_round_id;

  if not exists(select 1 from public.license_rounds where season_division_id=v_round.season_division_id and status<>'closed') then
    delete from public.license_final_standings where season_division_id=v_round.season_division_id;
    delete from public.license_team_final_standings where season_division_id=v_round.season_division_id;

    insert into public.license_final_standings(season_division_id,member_id,final_points,final_position,updated_by)
    select v_round.season_division_id,rs.member_id,max(rs.points_total),
      row_number() over(order by max(rs.points_total) desc,rs.member_id)::integer,(select auth.uid())
    from public.license_round_standings rs join public.license_rounds r on r.id=rs.round_id
    where r.season_division_id=v_round.season_division_id
    group by rs.member_id
    on conflict(season_division_id,member_id) do update set final_points=excluded.final_points,final_position=excluded.final_position,updated_by=excluded.updated_by,updated_at=now();

    insert into public.license_team_final_standings(season_division_id,team_id,final_points,final_position,updated_by)
    select v_round.season_division_id,t.id,coalesce(sum(coalesce(delta.points,0)),0),
      row_number() over(order by coalesce(sum(coalesce(delta.points,0)),0) desc,t.id)::integer,(select auth.uid())
    from public.teams t left join (
      select e.team_id,rs.round_id,rs.member_id,
        rs.points_total-coalesce((select prior.points_total from public.license_round_standings prior join public.license_rounds pround on pround.id=prior.round_id
          where prior.member_id=rs.member_id and pround.season_division_id=v_round.season_division_id and pround.round_number<r.round_number
          order by pround.round_number desc limit 1),0) as points
      from public.license_round_standings rs join public.license_rounds r on r.id=rs.round_id and r.season_division_id=v_round.season_division_id
      join public.caleris_race_result_entries e on e.round_id=rs.round_id and e.member_id=rs.member_id
    ) delta on delta.team_id=t.id
    where lower(t.division_key)=lower(v_division.division_key)
    group by t.id
    on conflict(season_division_id,team_id) do update set final_points=excluded.final_points,final_position=excluded.final_position,updated_by=excluded.updated_by,updated_at=now();

    select exists(select 1 from public.caleris_configurations where category='license' and config_key='scoring-wdc-'||v_division.division_key and is_active and coalesce(nullif(payload->>'points','')::numeric,0)>0) into v_has_wdc;
    if v_has_wdc and exists(select 1 from public.caleris_prizepool_rules where division_key=v_division.division_key and is_active) then
      begin
        v_finalized:=public.finalize_license_division(v_round.season_division_id);
        v_payout:=public.payout_season_prizepool(v_round.season_division_id);
        if not exists(select 1 from public.license_season_divisions other where other.season_id=v_division.season_id and other.status<>'completed') then
          begin
            v_tax_assessment:=public.admin_generate_wealth_tax_assessments(v_division.season_id);
            v_tax_collection:=public.admin_collect_wealth_tax(v_division.season_id);
          exception when others then
            v_tax_collection:=jsonb_build_object('status','pending_configuration','detail',sqlerrm);
          end;
        end if;
      exception when others then
        v_payout:=jsonb_build_object('status','pending_configuration','detail',sqlerrm);
      end;
    else
      v_payout:=jsonb_build_object('status','pending_configuration','detail','WDC scoring atau Prizepool belum diaktifkan.');
    end if;
  end if;

  return jsonb_build_object('round_id',p_round_id,'winner_member_id',v_winner_id,'pole_member_id',v_pole_id,
    'fastest_lap_member_id',v_fastest_driver,'driver_of_day_member_id',p_driver_of_day_member_id,
    'drivers_classified',v_registered,'round_processing',v_result,'prizepool',coalesce(v_payout,'{"status":"not_final_round"}'::jsonb),'wealth_tax',coalesce(v_tax_collection,'{"status":"not_season_final"}'::jsonb));
end;
$$;

CREATE OR REPLACE FUNCTION public.admin_collect_wealth_tax(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not public.is_caleris_fia_or_admin() then
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_generate_wealth_tax_assessments(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not public.is_caleris_fia_or_admin() then
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
$function$;

CREATE OR REPLACE FUNCTION public.payout_season_prizepool(p_season_division_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_division public.license_season_divisions%rowtype;
 v_bank uuid;
 v_row record;
 v_wallet uuid;
 v_tx jsonb;
 v_paid integer:=0;
 v_driver_count integer;
 v_team_count integer;
 v_expected_count integer;
begin
 if not public.is_caleris_fia_or_admin() then raise exception 'Hanya Admin yang dapat membayarkan Prizepool.';end if;
 select * into v_division from public.license_season_divisions where id=p_season_division_id for update;
 if not found or v_division.status<>'completed' then raise exception 'Divisi harus difinalisasi sebelum Prizepool dibayarkan.';end if;
 if exists(select 1 from public.caleris_prizepool_payouts where season_division_id=p_season_division_id) then raise exception 'Prizepool untuk divisi ini sudah dibayarkan; pembayaran ulang diblokir.';end if;
 select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active order by created_at limit 1;
 if v_bank is null then raise exception 'Wallet VreeoBank aktif tidak ditemukan.';end if;
 select count(*) into v_driver_count from public.license_final_standings fs
 join public.license_season_members sm on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id and not sm.is_hiatus
 where fs.season_division_id=p_season_division_id;
 if v_driver_count=0 or v_driver_count<>(select count(*) from public.license_season_members where season_division_id=p_season_division_id and not is_hiatus) then raise exception 'Final standings Driver belum lengkap.';end if;
 select count(*) into v_team_count from public.teams where division_key=v_division.division_key;
 if v_team_count=0 or v_team_count<>(select count(*) from public.license_team_final_standings where season_division_id=p_season_division_id) then raise exception 'Final standings Team harus memuat seluruh tim pada divisi ini.';end if;
 if exists(select 1 from public.license_final_standings fs left join public.license_season_members sm
  on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id and not sm.is_hiatus
  where fs.season_division_id=p_season_division_id and sm.id is null) then raise exception 'Final standings Driver memuat peserta yang tidak aktif atau tidak terdaftar.';end if;
 if exists(select 1 from public.license_team_final_standings ts join public.teams t on t.id=ts.team_id
  where ts.season_division_id=p_season_division_id and t.division_key<>v_division.division_key) then raise exception 'Final standings Team memuat tim dari divisi lain.';end if;
 if (select min(final_position) from public.license_final_standings where season_division_id=p_season_division_id)<>1
  or (select max(final_position) from public.license_final_standings where season_division_id=p_season_division_id)<>v_driver_count then raise exception 'Posisi final Driver harus berurutan dari P1 tanpa celah.';end if;
 if (select min(final_position) from public.license_team_final_standings where season_division_id=p_season_division_id)<>1
  or (select max(final_position) from public.license_team_final_standings where season_division_id=p_season_division_id)<>v_team_count then raise exception 'Posisi final Team harus berurutan dari P1 tanpa celah.';end if;
 if exists(select 1 from public.license_team_final_standings a join public.license_team_final_standings b
  on b.season_division_id=a.season_division_id and b.final_position>a.final_position
  where a.season_division_id=p_season_division_id and a.final_points<b.final_points) then raise exception 'Posisi Team tidak sesuai urutan poin akhir.';end if;
 select count(*) into v_expected_count from (
  select fs.final_position,'driver'::text as recipient_type from public.license_final_standings fs
  join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key and pr.recipient_type='driver'
   and pr.final_position=fs.final_position and pr.is_active and pr.prize_amount>0 where fs.season_division_id=p_season_division_id
  union all
  select ts.final_position,'team'::text from public.license_team_final_standings ts
  join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key and pr.recipient_type='team'
   and pr.final_position=ts.final_position and pr.is_active and pr.prize_amount>0 where ts.season_division_id=p_season_division_id
 ) expected_prizes;
 for v_row in
  select 'driver'::text as recipient_type,fs.member_id as recipient_id,fs.final_position,pr.prize_amount
  from public.license_final_standings fs join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key
   and pr.recipient_type='driver' and pr.final_position=fs.final_position and pr.is_active
  where fs.season_division_id=p_season_division_id
  union all
  select 'team',ts.team_id,ts.final_position,pr.prize_amount
  from public.license_team_final_standings ts join public.caleris_prizepool_rules pr on pr.division_key=v_division.division_key
   and pr.recipient_type='team' and pr.final_position=ts.final_position and pr.is_active
  where ts.season_division_id=p_season_division_id
 loop
  if v_row.prize_amount=0 then continue;end if;
  if v_row.recipient_type='driver' then
   select id into v_wallet from public.economy_wallet_accounts where member_id=v_row.recipient_id and account_kind='driver' and is_active for update;
  else
   select id into v_wallet from public.economy_wallet_accounts where team_id=v_row.recipient_id and account_kind='team' and is_active for update;
  end if;
  if v_wallet is null then raise exception 'Wallet penerima Prizepool posisi % tidak ditemukan.',v_row.final_position;end if;
  v_tx:=private.post_economy_transaction(v_bank,v_wallet,v_row.prize_amount,'prize',
   'Season Prizepool · '||v_division.division_name||' · '||initcap(v_row.recipient_type)||' P'||v_row.final_position,
   'season-prizepool:'||p_season_division_id::text||':'||v_row.recipient_type||':'||v_row.recipient_id::text,
   (select auth.uid()),jsonb_build_object('season_division_id',p_season_division_id,'division_key',v_division.division_key,
    'recipient_type',v_row.recipient_type,'recipient_id',v_row.recipient_id,'final_position',v_row.final_position));
  insert into public.caleris_prizepool_payouts(season_division_id,recipient_type,recipient_id,final_position,prize_amount,transaction_id,paid_by)
  values(p_season_division_id,v_row.recipient_type,v_row.recipient_id,v_row.final_position,v_row.prize_amount,
   (v_tx->>'transaction_id')::uuid,(select auth.uid()));
  v_paid:=v_paid+1;
 end loop;
 if v_paid<>v_expected_count or v_expected_count=0 then raise exception 'Konfigurasi Prizepool belum mencakup semua posisi berhadiah. Tidak ada pembayaran yang disimpan.';end if;
 return jsonb_build_object('season_division_id',p_season_division_id,'payout_count',v_paid,'status','paid');
end;$function$;

commit;
