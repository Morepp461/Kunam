create or replace function public.member_team_cash_loan_preview(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles%rowtype; v_member public.members%rowtype; v_season public.license_seasons%rowtype;
 v_team_wallet uuid; v_income numeric(20,2); v_open boolean; v_periods integer;
begin
 select * into v_profile from public.profiles where user_id=p_actor_id;
 if not found or v_profile.member_id is null then raise exception 'Akun belum terhubung dengan member CALERIS.'; end if;
 select * into v_member from public.members where id=v_profile.member_id;
 if v_member.role<>'Owner' or v_member.team_id is null then raise exception 'Hanya Team Owner yang dapat mengajukan pinjaman tim.'; end if;
 select * into v_season from public.license_seasons where status='active' order by starts_on desc limit 1;
 if not found then raise exception 'Belum ada season aktif.'; end if;
 select id into v_team_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_member.team_id and is_active for update;
 if v_team_wallet is null then raise exception 'Team Wallet belum tersedia.'; end if;
 select coalesce(sum(e.amount),0) into v_income
 from public.economy_entries e join public.economy_transactions t on t.id=e.transaction_id
 where e.entry_side='inflow' and e.account_id=v_team_wallet
 and t.created_at>=v_season.starts_on::timestamptz and t.created_at<(v_season.ends_on+1)::timestamptz
 and t.event_type in ('payroll','checkin_reward','bank_reward','sponsor_payout');
 select exists(select 1 from public.economy_cash_loans l where l.team_id=v_member.team_id and l.loan_type='team' and l.status in ('active','overdue')) into v_open;
 select count(*) into v_periods from public.season_calendar_periods p where p.season_id=v_season.id and p.period_type='race_period';
 return jsonb_build_object('member_id',v_member.id,'team_id',v_member.team_id,'season_id',v_season.id,'season_title',v_season.title,'wallet_id',v_team_wallet,
 'season_income',v_income,'max_loan',round(v_income*5,2),'has_open_loan',v_open,'race_period_count',v_periods,
 'interest_rates',(select jsonb_agg(jsonb_build_object('tenor_seasons',r.tenor_seasons,'total_interest_rate',r.total_interest_rate) order by r.tenor_seasons) from public.economy_cash_loan_interest_rates r));
end; $$;

create or replace function public.member_apply_team_cash_loan(p_actor_id uuid,p_amount numeric,p_tenor_seasons integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_preview jsonb; v_member_id uuid; v_team_id uuid; v_season_id uuid; v_wallet uuid; v_rate numeric(6,3);
 v_interest numeric(20,2); v_total numeric(20,2); v_bank uuid; v_loan_id uuid; v_tx jsonb;
begin
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal pinjaman harus positif dengan maksimal dua desimal.'; end if;
 if p_tenor_seasons not between 1 and 4 then raise exception 'Tenor pinjaman hanya 1 sampai 4 season.'; end if;
 v_preview:=public.member_team_cash_loan_preview(p_actor_id);
 if coalesce((v_preview->>'has_open_loan')::boolean,false) then raise exception 'Tim masih memiliki pinjaman berjalan.'; end if;
 v_member_id:=(v_preview->>'member_id')::uuid; v_team_id:=(v_preview->>'team_id')::uuid;
 v_season_id:=(v_preview->>'season_id')::uuid; v_wallet:=(v_preview->>'wallet_id')::uuid;
 if p_amount>(v_preview->>'max_loan')::numeric then raise exception 'Nominal melebihi batas 5 kali income Team Wallet season berjalan.'; end if;
 select total_interest_rate into v_rate from public.economy_cash_loan_interest_rates where tenor_seasons=p_tenor_seasons;
 if v_rate is null then raise exception 'Tabel bunga tenor belum tersedia.'; end if;
 select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active for update;
 if v_bank is null then raise exception 'Wallet VreeoBank tidak tersedia.'; end if;
 v_interest:=round(p_amount*v_rate/100,2); v_total:=p_amount+v_interest; v_loan_id:=gen_random_uuid();
 insert into public.economy_cash_loans(id,member_id,profile_user_id,wallet_id,origin_season_id,principal,tenor_seasons,total_interest_rate,interest_amount,total_due,loan_type,team_id)
 values(v_loan_id,v_member_id,p_actor_id,v_wallet,v_season_id,p_amount,p_tenor_seasons,v_rate,v_interest,v_total,'team',v_team_id);
 v_tx:=private.post_cash_loan_transaction(v_bank,v_wallet,p_amount,'loan_disbursement','Team Cash Loan · '||p_tenor_seasons||' Season',
 'team-cash-loan-disbursement:'||v_loan_id::text,p_actor_id,jsonb_build_object('loan_id',v_loan_id,'team_id',v_team_id,'season_id',v_season_id,'tenor_seasons',p_tenor_seasons,'interest_rate',v_rate));
 update public.economy_cash_loans set disbursement_transaction_id=(v_tx->>'transaction_id')::uuid where id=v_loan_id;
 return jsonb_build_object('loan_id',v_loan_id,'team_id',v_team_id,'principal',p_amount,'interest_rate',v_rate,'interest_amount',v_interest,'total_due',v_total,'status','active');
end; $$;
grant execute on function public.member_team_cash_loan_preview(uuid) to service_role;
grant execute on function public.member_apply_team_cash_loan(uuid,numeric,integer) to service_role;