-- CALERIS Operations Suite workflows: DDP/TDP awards, annual wallet tax, and FIA fines.
create or replace function private.award_development_token(
 p_asset_type text,p_member_id uuid,p_team_id uuid,p_amount numeric,
 p_source_type text,p_source_id uuid,p_idempotency_key text,p_description text,p_actor_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_account_id uuid;v_entry_id uuid;
begin
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then return null; end if;
 if p_asset_type='DDP' and p_member_id is not null and p_team_id is null then
  insert into public.caleris_development_accounts(asset_type,member_id) values('DDP',p_member_id)
  on conflict(member_id) where asset_type='DDP' do nothing;
  select id into v_account_id from public.caleris_development_accounts where asset_type='DDP' and member_id=p_member_id for update;
 elsif p_asset_type='TDP' and p_team_id is not null and p_member_id is null then
  insert into public.caleris_development_accounts(asset_type,team_id) values('TDP',p_team_id)
  on conflict(team_id) where asset_type='TDP' do nothing;
  select id into v_account_id from public.caleris_development_accounts where asset_type='TDP' and team_id=p_team_id for update;
 else raise exception 'Development token account target is invalid.'; end if;
 if exists(select 1 from public.caleris_development_ledger where idempotency_key=p_idempotency_key) then
  return v_account_id;
 end if;
 insert into public.caleris_development_ledger(account_id,delta,source_type,source_id,idempotency_key,description,created_by)
 values(v_account_id,p_amount,p_source_type,p_source_id,p_idempotency_key,p_description,p_actor_id)
 returning id into v_entry_id;
 update public.caleris_development_accounts set balance=balance+p_amount,updated_at=now() where id=v_account_id;
 return v_account_id;
end;
$$;
revoke all on function private.award_development_token(text,uuid,uuid,numeric,text,uuid,text,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.fia_record_race_result(p_round_id uuid,p_winner_member_id uuid,p_pole_member_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_round public.license_rounds%rowtype;v_division public.license_season_divisions%rowtype;
 v_rule public.caleris_race_reward_rules%rowtype;v_winner_team uuid;v_pole_team uuid;
begin
 if not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat memasukkan hasil race.'; end if;
 select * into v_round from public.license_rounds where id=p_round_id for update;
 if not found or v_round.status<>'closed' then raise exception 'Round harus sudah ditutup sebelum hasil resmi dimasukkan.'; end if;
 select * into v_division from public.license_season_divisions where id=v_round.season_division_id;
 if not exists(select 1 from public.license_season_members where season_division_id=v_division.id and member_id=p_winner_member_id and not is_hiatus)
  or not exists(select 1 from public.license_season_members where season_division_id=v_division.id and member_id=p_pole_member_id and not is_hiatus)
  or not exists(select 1 from public.members where id in (p_winner_member_id,p_pole_member_id) and role='Driver') then
  raise exception 'Pemenang dan pole sitter harus Driver aktif yang terdaftar pada divisi race ini.';
 end if;
 select team_id into v_winner_team from public.members where id=p_winner_member_id;
 select team_id into v_pole_team from public.members where id=p_pole_member_id;
 insert into public.caleris_race_results(round_id,winner_member_id,pole_member_id,entered_by,published_at)
 values(p_round_id,p_winner_member_id,p_pole_member_id,(select auth.uid()),now());
 select * into v_rule from public.caleris_race_reward_rules where season_division_id=v_division.id and is_active;
 if found then
  perform private.award_development_token('DDP',p_winner_member_id,null,v_rule.driver_win_ddp,'race_win',p_round_id,
   'race-win-ddp:'||p_round_id::text,'Race winner DDP · '||v_round.title,(select auth.uid()));
  if v_winner_team is not null then
   perform private.award_development_token('TDP',null,v_winner_team,v_rule.team_win_tdp,'race_win',p_round_id,
    'race-win-tdp:'||p_round_id::text,'Race winner team TDP · '||v_round.title,(select auth.uid()));
  end if;
  perform private.award_development_token('DDP',p_pole_member_id,null,v_rule.driver_pole_ddp,'pole_position',p_round_id,
   'pole-ddp:'||p_round_id::text,'Pole position DDP · '||v_round.title,(select auth.uid()));
  if v_pole_team is not null then
   perform private.award_development_token('TDP',null,v_pole_team,v_rule.team_pole_tdp,'pole_position',p_round_id,
    'pole-tdp:'||p_round_id::text,'Pole position team TDP · '||v_round.title,(select auth.uid()));
  end if;
 end if;
 return jsonb_build_object('round_id',p_round_id,'winner_member_id',p_winner_member_id,'pole_member_id',p_pole_member_id,'rewards_issued',coalesce(v_rule.is_active,false));
end;
$$;
revoke all on function public.fia_record_race_result(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.fia_record_race_result(uuid,uuid,uuid) to authenticated;

create or replace function public.admin_generate_wealth_tax_assessments(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat menghitung Wealth Tax.'; end if;
 raise exception 'Wealth Tax belum dapat dihitung: basis kekayaan kena pajak masih menunggu keputusan Admin.';
end;
$$;
revoke all on function public.admin_generate_wealth_tax_assessments(uuid) from public,anon,service_role;
grant execute on function public.admin_generate_wealth_tax_assessments(uuid) to authenticated;

create or replace function public.admin_collect_wealth_tax(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat menagih Wealth Tax.'; end if;
 raise exception 'Penagihan Wealth Tax dinonaktifkan sampai basis kekayaan kena pajak ditetapkan.';
end;
$$;
revoke all on function public.admin_collect_wealth_tax(uuid) from public,anon,service_role;
grant execute on function public.admin_collect_wealth_tax(uuid) to authenticated;

create or replace function public.fia_issue_fine(p_target_kind text,p_target_id uuid,p_amount numeric,p_reason text,p_regulation_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_wallet uuid;v_bank uuid;v_fine_id uuid;v_member public.members%rowtype;v_result jsonb;v_team_id uuid;
begin
 if not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat menjatuhkan denda.'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal denda tidak valid.'; end if;
 if p_reason is null or length(trim(p_reason))=0 then raise exception 'Alasan denda wajib diisi.'; end if;
 select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active;
 if p_target_kind='member' then
  select * into v_member from public.members where id=p_target_id;
  if not found then raise exception 'Member target tidak ditemukan.'; end if;
  select id into v_wallet from public.economy_wallet_accounts where member_id=p_target_id and account_kind=case when v_member.role='Driver' then 'driver' when v_member.role='Owner' then 'team_owner' else 'public_member' end and is_active;
  if v_wallet is null and v_member.role not in ('Driver','Owner') then
   select wa.id into v_wallet from public.profiles p join public.economy_wallet_accounts wa on wa.profile_user_id=p.user_id and wa.account_kind='public_member' where p.member_id=p_target_id and wa.is_active;
  end if;
  insert into public.caleris_fines(target_kind,target_member_id,amount,regulation_reference,reason,issued_by)
  values('member',p_target_id,p_amount,nullif(trim(p_regulation_reference),''),trim(p_reason),(select auth.uid())) returning id into v_fine_id;
 elsif p_target_kind='team' then
  select id into v_wallet from public.economy_wallet_accounts where team_id=p_target_id and account_kind='team' and is_active;
  if v_wallet is null then raise exception 'Team wallet tidak ditemukan.'; end if;
  insert into public.caleris_fines(target_kind,target_team_id,amount,regulation_reference,reason,issued_by)
  values('team',p_target_id,p_amount,nullif(trim(p_regulation_reference),''),trim(p_reason),(select auth.uid())) returning id into v_fine_id;
 else raise exception 'Jenis target denda tidak valid.'; end if;
 if v_wallet is null or v_bank is null then raise exception 'Wallet target atau VreeoBank tidak tersedia.'; end if;
 v_result:=private.post_economy_transaction(v_wallet,v_bank,p_amount,'fine','FIA Fine · '||trim(p_reason),
  'fia-fine:'||v_fine_id::text,(select auth.uid()),jsonb_build_object('fine_id',v_fine_id,'target_kind',p_target_kind,'target_id',p_target_id,'regulation_reference',p_regulation_reference),null,false);
 update public.caleris_fines set transaction_id=(v_result->>'transaction_id')::uuid where id=v_fine_id;
 return jsonb_build_object('fine_id',v_fine_id,'transaction_id',v_result->>'transaction_id','status','posted');
end;
$$;
revoke all on function public.fia_issue_fine(text,uuid,numeric,text,text) from public,anon,service_role;
grant execute on function public.fia_issue_fine(text,uuid,numeric,text,text) to authenticated;
