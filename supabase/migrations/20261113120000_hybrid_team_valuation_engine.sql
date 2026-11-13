alter table public.caleris_team_valuations
  add column if not exists base_valuation numeric(18,2),
  add column if not exists team_score numeric(8,4),
  add column if not exists score_breakdown jsonb,
  add column if not exists debt_penalty numeric(8,4) not null default 0,
  add column if not exists overdue_penalty numeric(8,4) not null default 0;

create or replace function public.admin_assess_team_valuation(
  p_team_id uuid,
  p_base_valuation numeric,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_admin boolean;
  v_team record;
  v_seasons uuid[];
  v_latest uuid;
  v_previous uuid;
  v_wallet numeric := 0;
  v_development numeric := 0;
  v_achievement numeric := 0;
  v_license numeric := 0;
  v_cashflow numeric := 0;
  v_debt numeric := 0;
  v_overdue numeric := 0;
  v_points_latest numeric := 0;
  v_points_previous numeric := 0;
  v_pos_latest numeric := 100;
  v_pos_previous numeric := 100;
  v_points_score numeric := 0;
  v_position_score numeric := 0;
  v_trend numeric := 0;
  v_history numeric := 0;
  v_development_score numeric := 0;
  v_achievement_score numeric := 0;
  v_wallet_score numeric := 0;
  v_license_score numeric := 0;
  v_cashflow_score numeric := 0;
  v_debt_penalty numeric := 0;
  v_overdue_penalty numeric := 0;
  v_score numeric := 0;
  v_total numeric := 0;
  v_season_start date;
  v_season_end date;
  v_snapshot jsonb;
  v_id uuid;
  v_max_points numeric := 0;
  v_max_position integer := 0;
  v_max_achievements integer := 0;
  v_max_wallet numeric := 0;
  v_max_cashflow numeric := 0;
begin
  select exists(select 1 from public.site_admins a where a.user_id=auth.uid()) into v_admin;
  if not v_admin then raise exception 'Admin access required'; end if;
  if p_base_valuation is null or p_base_valuation < 0 then raise exception 'Base valuation must be zero or greater'; end if;

  select id,name into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'Team not found'; end if;

  select array_agg(id order by starts_on desc) into v_seasons
  from (select id,starts_on from public.license_seasons where status <> 'draft' order by starts_on desc limit 2) s;
  v_latest := v_seasons[1];
  v_previous := v_seasons[2];

  select coalesce(balance,0) into v_wallet from public.economy_wallet_accounts
  where team_id=p_team_id and account_kind='team' and is_active=true limit 1;

  select coalesce(avg(current_value),50) into v_development
  from public.caleris_team_development_parts where team_id=p_team_id;

  select coalesce(count(*),0) into v_achievement from public.caleris_achievements
  where team_id=p_team_id;

  select coalesce(max(case upper(coalesce(m.license,'')) when 'A' then 100 when 'B' then 80 when 'C' then 60 when 'D' then 40 when 'E' then 20 when 'F' then 0 else 0 end),0)
  into v_license from public.members m where m.team_id=p_team_id and m.role='Driver';

  select coalesce(sum(l.total_due-l.amount_repaid),0),
         coalesce(sum(case when l.status='overdue' then l.total_due-l.amount_repaid else 0 end),0)
  into v_debt,v_overdue from public.economy_cash_loans l
  where l.loan_type='team' and l.team_id=p_team_id and l.status in ('active','overdue');

  if v_latest is not null then
    select coalesce(sum(fs.final_points),0),coalesce(avg(fs.final_position),100)
    into v_points_latest,v_pos_latest
    from public.license_final_standings fs
    join public.license_season_divisions d on d.id=fs.season_division_id
    join public.members m on m.id=fs.member_id
    where d.season_id=v_latest and m.team_id=p_team_id;

    select coalesce(sum(case when t.destination_account_id=w.id then t.amount else -t.amount end),0) into v_cashflow
    from public.economy_transactions t
    join public.economy_wallet_accounts w on w.team_id=p_team_id and w.account_kind='team'
      and (w.id=t.source_account_id or w.id=t.destination_account_id)
    where t.created_at >= (select starts_on::timestamptz from public.license_seasons where id=v_latest)
      and t.created_at < ((select ends_on from public.license_seasons where id=v_latest)+1)::timestamptz
      and t.event_type not in ('loan_disbursement','loan_repayment');
  end if;
  if v_previous is not null then
    select coalesce(sum(fs.final_points),0),coalesce(avg(fs.final_position),100)
    into v_points_previous,v_pos_previous
    from public.license_final_standings fs
    join public.license_season_divisions d on d.id=fs.season_division_id
    join public.members m on m.id=fs.member_id
    where d.season_id=v_previous and m.team_id=p_team_id;
  end if;

  select coalesce(max(x.points),0),coalesce(max(x.position),0),coalesce(max(x.achievements),0),
         coalesce(max(x.wallet),0),coalesce(max(x.cashflow),0)
  into v_max_points,v_max_position,v_max_achievements,v_max_wallet,v_max_cashflow
  from (
    select t.id,
      coalesce((select sum(fs.final_points) from public.license_final_standings fs join public.license_season_divisions d on d.id=fs.season_division_id join public.members m on m.id=fs.member_id where d.season_id=v_latest and m.team_id=t.id),0) points,
      coalesce((select avg(fs.final_position) from public.license_final_standings fs join public.license_season_divisions d on d.id=fs.season_division_id join public.members m on m.id=fs.member_id where d.season_id=v_latest and m.team_id=t.id),100) position,
      (select count(*) from public.caleris_achievements a where a.team_id=t.id) achievements,
      coalesce((select w.balance from public.economy_wallet_accounts w where w.team_id=t.id and w.account_kind='team' and w.is_active=true limit 1),0) wallet,
      greatest(0,coalesce((select sum(case when tx.destination_account_id=w.id then tx.amount else -tx.amount end) from public.economy_transactions tx join public.economy_wallet_accounts w on w.team_id=t.id and w.account_kind='team' and (w.id=tx.source_account_id or w.id=tx.destination_account_id) where tx.event_type not in ('loan_disbursement','loan_repayment')),0)) cashflow
    from public.teams t
  ) x;

  v_points_score := case when v_max_points>0 then least(100,v_points_latest/v_max_points*100) else 0 end;
  v_position_score := case when v_max_position>1 then greatest(0,least(100,(v_max_position-v_pos_latest)/(v_max_position-1)*100)) else 0 end;
  v_trend := (v_points_score*0.5 + v_position_score*0.5);
  if v_previous is not null then
    v_trend := v_trend*0.65 + (
      (case when v_max_points>0 then least(100,v_points_previous/v_max_points*100) else 0 end)*0.5
      + (case when v_max_position>1 then greatest(0,least(100,(v_max_position-v_pos_previous)/(v_max_position-1)*100)) else 0 end)*0.5
    )*0.35;
  end if;

  v_development_score := least(100,greatest(0,v_development));
  v_achievement_score := case when v_max_achievements>0 then least(100,v_achievement::numeric/v_max_achievements*100) else 0 end;
  v_wallet_score := case when v_max_wallet>0 then least(100,v_wallet/v_max_wallet*100) else 0 end;
  v_license_score := v_license;
  v_cashflow_score := case when v_max_cashflow>0 then least(100,greatest(0,v_cashflow)/v_max_cashflow*100) else 0 end;
  v_debt_penalty := case when v_debt+v_wallet>0 then least(30,(v_debt/(v_debt+v_wallet))*30) else 0 end;
  v_overdue_penalty := case when v_debt>0 then least(30,(v_overdue/v_debt)*30) else 0 end;

  -- The six component weights sum to 90; normalize by 90 as agreed.
  v_score := (v_development_score*25 + v_achievement_score*15 + v_trend*20 + v_wallet_score*10 + v_license_score*10 + v_cashflow_score*10)/90;
  v_score := greatest(0,least(100,v_score-v_debt_penalty-v_overdue_penalty));
  v_total := round(p_base_valuation*v_score/100,2);

  v_snapshot := jsonb_build_object(
    'development_progress',jsonb_build_object('score',round(v_development_score,2),'weight',25,'average_attribute',round(v_development,2)),
    'achievement_history',jsonb_build_object('score',round(v_achievement_score,2),'weight',15,'count',v_achievement),
    'two_season_trend',jsonb_build_object('score',round(v_trend,2),'weight',20,'latest_points',v_points_latest,'previous_points',v_points_previous,'latest_average_position',v_pos_latest,'previous_average_position',v_pos_previous),
    'team_wallet',jsonb_build_object('score',round(v_wallet_score,2),'weight',10,'balance',v_wallet),
    'best_driver_license',jsonb_build_object('score',round(v_license_score,2),'weight',10,'rank',v_license),
    'season_net_cashflow',jsonb_build_object('score',round(v_cashflow_score,2),'weight',10,'net_amount',v_cashflow),
    'active_team_debt',jsonb_build_object('amount',v_debt,'penalty_points',round(v_debt_penalty,2)),
    'overdue_installments',jsonb_build_object('amount',v_overdue,'penalty_points',round(v_overdue_penalty,2)),
    'weights_normalized_from',90
  );

  insert into public.caleris_team_valuations(
    team_id,season_id,assets_value,development_value,history_value,achievements_value,
    financial_health_value,total_valuation,base_valuation,team_score,score_breakdown,
    debt_penalty,overdue_penalty,notes,assessed_by
  ) values (
    p_team_id,v_latest,p_base_valuation,v_development,v_trend,v_achievement,
    v_wallet,v_total,p_base_valuation,round(v_score,4),v_snapshot,
    round(v_debt_penalty,4),round(v_overdue_penalty,4),nullif(trim(p_notes),''),auth.uid()
  ) returning id into v_id;

  return jsonb_build_object('valuation_id',v_id,'base_valuation',p_base_valuation,'team_score',round(v_score,4),'total_valuation',v_total,'score_breakdown',v_snapshot);
end;
$$;
revoke all on function public.admin_assess_team_valuation(uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.admin_assess_team_valuation(uuid,numeric,text) to authenticated,service_role;
