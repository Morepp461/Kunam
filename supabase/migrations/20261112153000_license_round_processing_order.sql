-- Ensure inactivity streaks are processed in strict round order.
create or replace function public.process_license_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_round public.license_rounds%rowtype;
 v_rule public.caleris_configurations%rowtype;
 v_member record;
 v_streak integer;
 v_threshold integer;
 v_penalty numeric;
 v_current numeric;
 v_delta numeric;
 v_processed integer:=0;
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat memproses round.';end if;
 select * into v_round from public.license_rounds where id=p_round_id for update;
 if not found then raise exception 'Round tidak ditemukan.';end if;
 if v_round.status='closed' then raise exception 'Round sudah diproses.';end if;
 if v_round.checkin_closes_at>now() then raise exception 'Periode check-in round ini belum berakhir.';end if;
 if exists(select 1 from public.license_rounds previous where previous.season_division_id=v_round.season_division_id and previous.round_number<v_round.round_number and previous.status<>'closed') then
  raise exception 'Round harus diproses berurutan. Selesaikan seluruh round sebelumnya terlebih dahulu.';
 end if;
 if not exists(select 1 from public.license_season_divisions sd join public.license_seasons s on s.id=sd.season_id where sd.id=v_round.season_division_id and sd.status='active' and s.status='active') then
  raise exception 'Season dan divisi harus aktif untuk memproses round.';
 end if;
 select * into v_rule from public.caleris_configurations where category='license' and config_key='scoring-inactivity' and is_active;
 v_threshold:=nullif(v_rule.payload->>'absence_races','')::integer;
 v_penalty:=nullif(v_rule.payload->>'penalty_points','')::numeric;
 if v_threshold is null or v_threshold<=0 or v_penalty is null or v_penalty<=0 then raise exception 'Konfigurasi inactivity penalty belum valid.';end if;
 for v_member in select sm.member_id,sm.season_id,sm.consecutive_absent_rounds from public.license_season_members sm where sm.season_division_id=v_round.season_division_id and not sm.is_hiatus loop
  if exists(select 1 from public.license_daily_checkins c where c.member_id=v_member.member_id and c.checkin_date between (v_round.checkin_opens_at at time zone 'Asia/Jakarta')::date and (v_round.checkin_closes_at at time zone 'Asia/Jakarta')::date) then
   v_streak:=0;
  else
   v_streak:=v_member.consecutive_absent_rounds+1;
   if v_streak>=v_threshold and mod(v_streak,v_threshold)=0 then
    select coalesce(sum(l.points_delta),0) into v_current from public.license_score_ledger l where l.member_id=v_member.member_id and l.season_id=v_member.season_id and l.source_type<>'wdc';
    v_delta:=-least(v_penalty,greatest(v_current,0));
    if v_delta<0 then
     insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
     values(v_member.member_id,v_member.season_id,v_round.season_division_id,'inactivity_penalty',v_delta,'absence:'||v_round.id::text||':'||v_member.member_id::text,'Inactivity penalty after consecutive rounds without daily check-in',jsonb_build_object('round_id',v_round.id,'absence_streak',v_streak,'configured_penalty',v_penalty))
     on conflict(idempotency_key) do nothing;
    end if;
   end if;
  end if;
  update public.license_season_members set consecutive_absent_rounds=v_streak where season_division_id=v_round.season_division_id and member_id=v_member.member_id;
  v_processed:=v_processed+1;
 end loop;
 update public.license_rounds set status='closed',processed_at=now(),processed_by=(select auth.uid()) where id=p_round_id;
 return jsonb_build_object('round_id',p_round_id,'drivers_processed',v_processed,'status','closed');
end;$$;
revoke all on function public.process_license_round(uuid) from public,anon,service_role;
grant execute on function public.process_license_round(uuid) to authenticated;
