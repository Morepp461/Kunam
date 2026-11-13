drop policy if exists "Team Owners read own team roster" on public.members;
create policy "Team Owners read own team roster" on public.members for select to authenticated using(exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id where p.user_id=(select auth.uid()) and owner.role='Owner' and owner.team_id=members.team_id));
drop policy if exists "Authenticated members read season calendar periods" on public.season_calendar_periods;
create policy "Authenticated members read season calendar periods" on public.season_calendar_periods for select to authenticated using(true);
drop policy if exists "Team Owners register contracted drivers during Off Season" on public.license_season_members;
create policy "Team Owners register contracted drivers during Off Season" on public.license_season_members for insert to authenticated with check(exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id join public.caleris_member_directory driver on driver.id=license_season_members.member_id join public.teams t on t.id=owner.team_id join public.license_season_divisions sd on sd.id=license_season_members.season_division_id join public.season_calendar_periods period on period.season_id=license_season_members.season_id join public.economy_driver_contracts contract on contract.member_id=driver.id and contract.team_id=t.id and contract.season_id=license_season_members.season_id where p.user_id=(select auth.uid()) and owner.role='Owner' and driver.role='Driver' and driver.team_id=t.id and lower(t.division_key)=lower(sd.division_key) and sd.season_id=license_season_members.season_id and period.period_type='off_season' and current_date between period.starts_on and period.ends_on and contract.status='active' and not exists(select 1 from public.license_season_members existing where existing.season_id=license_season_members.season_id and existing.member_id=license_season_members.member_id)));
create or replace function public.member_register_driver_for_season(p_season_division_id uuid,p_driver_member_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_actor public.members%rowtype;v_team_id uuid;v_division public.license_season_divisions%rowtype;v_driver record;v_registration_id uuid;
begin
if (select auth.uid()) is null then raise exception 'Authentication required.';end if;
select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
if not found or v_actor.role<>'Owner' or v_actor.team_id is null then raise exception 'Hanya Team Owner yang dapat mendaftarkan driver.';end if;
v_team_id:=v_actor.team_id;
select * into v_division from public.license_season_divisions where id=p_season_division_id;
if not found then raise exception 'Season division tidak ditemukan.';end if;
if not exists(select 1 from public.teams t where t.id=v_team_id and lower(t.division_key)=lower(v_division.division_key)) then raise exception 'Divisi pendaftaran tidak sesuai dengan divisi tim.';end if;
if not exists(select 1 from public.season_calendar_periods p where p.season_id=v_division.season_id and p.period_type='off_season' and current_date between p.starts_on and p.ends_on) then raise exception 'Pendaftaran hanya dibuka selama Off Season season tujuan.';end if;
select id,role,team_id,license into v_driver from public.caleris_member_directory where id=p_driver_member_id;
if not found or v_driver.role<>'Driver' or v_driver.team_id is distinct from v_team_id then raise exception 'Driver harus berstatus Driver dan terikat pada tim ini.';end if;
if not exists(select 1 from public.economy_driver_contracts c where c.season_id=v_division.season_id and c.team_id=v_team_id and c.member_id=p_driver_member_id and c.status='active') then raise exception 'Driver belum memiliki kontrak aktif dengan tim untuk season tujuan.';end if;
if exists(select 1 from public.license_season_members sm where sm.season_id=v_division.season_id and sm.member_id=p_driver_member_id) then raise exception 'Driver sudah terdaftar pada season ini.';end if;
insert into public.license_season_members(season_id,season_division_id,member_id,is_hiatus,preserved_license) values(v_division.season_id,v_division.id,p_driver_member_id,false,v_driver.license) returning id into v_registration_id;
return v_registration_id;
end;$$;
revoke all on function public.member_register_driver_for_season(uuid,uuid) from public,anon,service_role;
grant execute on function public.member_register_driver_for_season(uuid,uuid) to authenticated;
create or replace function public.fia_decide_appeal(p_appeal_id uuid,p_approve boolean,p_decision text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_appeal public.caleris_appeals%rowtype;
begin
if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat memutuskan banding.';end if;
if nullif(trim(p_decision),'') is null then raise exception 'Alasan keputusan wajib diisi.';end if;
select * into v_appeal from public.caleris_appeals where id=p_appeal_id for update;
if not found then raise exception 'Banding tidak ditemukan.';end if;
if v_appeal.status<>'pending' then raise exception 'Banding sudah diputuskan.';end if;
update public.caleris_appeals set status=case when p_approve then 'approved' else 'rejected' end,fia_decision=trim(p_decision),decided_by=(select auth.uid()),decided_at=now() where id=p_appeal_id;
return jsonb_build_object('id',p_appeal_id,'status',case when p_approve then 'approved' else 'rejected' end);
end;$$;
revoke all on function public.fia_decide_appeal(uuid,boolean,text) from public,anon,service_role;
grant execute on function public.fia_decide_appeal(uuid,boolean,text) to authenticated;
create or replace function public.fia_publish_regulation(p_title text,p_body text,p_scope_kind text,p_division_key text default null,p_season_id uuid default null,p_version_label text default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_regulation_id uuid;
begin
if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat mempublikasikan regulasi.';end if;
if nullif(trim(p_title),'') is null or nullif(trim(p_body),'') is null then raise exception 'Judul dan isi regulasi wajib diisi.';end if;
if p_scope_kind not in ('permanent','seasonal') then raise exception 'Scope regulasi tidak valid.';end if;
if p_scope_kind='seasonal' and p_season_id is null then raise exception 'Season wajib dipilih untuk regulasi seasonal.';end if;
if p_scope_kind='permanent' and p_season_id is not null then raise exception 'Regulasi permanent tidak boleh terikat ke season.';end if;
insert into public.caleris_regulations(title,body,scope_kind,division_key,season_id,version_label,is_published,published_at,created_by) values(trim(p_title),trim(p_body),p_scope_kind,nullif(trim(p_division_key),''),p_season_id,nullif(trim(p_version_label),''),true,now(),(select auth.uid())) returning id into v_regulation_id;
insert into public.caleris_announcements(title,body,category,division_key,season_id,is_published,published_at,created_by) values(trim(p_title),trim(p_body),'regulation',nullif(trim(p_division_key),''),p_season_id,true,now(),(select auth.uid()));
return v_regulation_id;
end;$$;
revoke all on function public.fia_publish_regulation(text,text,text,text,uuid,text) from public,anon,service_role;
grant execute on function public.fia_publish_regulation(text,text,text,text,uuid,text) to authenticated;
create or replace function public.fia_record_race_result_entry(p_round_id uuid,p_member_id uuid,p_finish_status text,p_finishing_position integer default null,p_note text default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_round public.license_rounds%rowtype;v_member record;v_id uuid;
begin
if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat mencatat klasifikasi race.';end if;
if p_finish_status not in ('finished','dnf','dns','dsq') then raise exception 'Status klasifikasi tidak valid.';end if;
if p_finish_status='finished' and (p_finishing_position is null or p_finishing_position<1) then raise exception 'Finishing position wajib berupa angka positif untuk driver yang finish.';end if;
if p_finish_status<>'finished' and p_finishing_position is not null then raise exception 'Finishing position harus kosong untuk status non-finish.';end if;
select * into v_round from public.license_rounds where id=p_round_id for update;
if not found or v_round.status<>'closed' then raise exception 'Klasifikasi hanya dapat dicatat untuk round yang sudah ditutup.';end if;
select id,role,team_id into v_member from public.caleris_member_directory where id=p_member_id;
if not found or v_member.role<>'Driver' then raise exception 'Target klasifikasi harus merupakan Driver.';end if;
if not exists(select 1 from public.license_season_members sm where sm.season_division_id=v_round.season_division_id and sm.member_id=p_member_id and not sm.is_hiatus) then raise exception 'Driver tidak terdaftar aktif pada divisi season round ini.';end if;
insert into public.caleris_race_result_entries(round_id,member_id,team_id,finish_status,finishing_position,note,recorded_by,recorded_at) values(p_round_id,p_member_id,v_member.team_id,p_finish_status,p_finishing_position,nullif(trim(p_note),''),(select auth.uid()),now())
on conflict(round_id,member_id) do update set team_id=excluded.team_id,finish_status=excluded.finish_status,finishing_position=excluded.finishing_position,note=excluded.note,recorded_by=excluded.recorded_by,recorded_at=now()
returning id into v_id;
return v_id;
end;$$;
revoke all on function public.fia_record_race_result_entry(uuid,uuid,text,integer,text) from public,anon,service_role;
grant execute on function public.fia_record_race_result_entry(uuid,uuid,text,integer,text) to authenticated;