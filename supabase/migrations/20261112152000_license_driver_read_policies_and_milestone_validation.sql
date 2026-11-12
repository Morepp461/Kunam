create policy "Drivers read own license season" on public.license_seasons for select to authenticated using(exists(select 1 from public.license_season_members sm where sm.season_id=license_seasons.id and sm.member_id in(select p.member_id from public.profiles p where p.user_id=(select auth.uid()))));
create policy "Drivers read own license division" on public.license_season_divisions for select to authenticated using(exists(select 1 from public.license_season_members sm where sm.season_division_id=license_season_divisions.id and sm.member_id in(select p.member_id from public.profiles p where p.user_id=(select auth.uid()))));
create or replace function public.license_apply_standings_milestones()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_season_id uuid;v_division_id uuid;v_config record;v_member_role text;v_threshold numeric;v_reward numeric;
begin
 select r.season_division_id,sd.season_id into v_division_id,v_season_id from public.license_rounds r join public.license_season_divisions sd on sd.id=r.season_division_id where r.id=new.round_id and r.status<>'closed';
 if v_division_id is null then raise exception 'Round tidak ditemukan atau sudah ditutup.';end if;
 select m.role into v_member_role from public.members m where m.id=new.member_id;
 if v_member_role<>'Driver' or not exists(select 1 from public.license_season_members sm where sm.season_division_id=v_division_id and sm.member_id=new.member_id and not sm.is_hiatus) then raise exception 'Hanya driver aktif yang terdaftar pada divisi season ini yang dapat memperoleh milestone.';end if;
 for v_config in select c.config_key,c.payload from public.caleris_configurations c where c.category='license' and c.is_active and c.config_key like 'scoring-milestone-%' loop
  v_threshold:=nullif(v_config.payload->>'minimum_standings_points','')::numeric;v_reward:=nullif(v_config.payload->>'license_points','')::numeric;
  if v_threshold is null or v_threshold<=0 or v_reward is null or v_reward<=0 then raise exception 'Konfigurasi milestone % belum valid.',v_config.config_key;end if;
  if new.points_total>=v_threshold then
   insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
   values(new.member_id,v_season_id,v_division_id,'standings_milestone',v_reward,'milestone:'||v_division_id::text||':'||new.member_id::text||':'||v_config.config_key,'Standings milestone: '||v_config.config_key,jsonb_build_object('round_id',new.round_id,'points_total',new.points_total,'configuration_key',v_config.config_key)) on conflict(idempotency_key) do nothing;
  end if;
 end loop;return new;
end;$$;
revoke all on function public.license_apply_standings_milestones() from public,anon,authenticated,service_role;
