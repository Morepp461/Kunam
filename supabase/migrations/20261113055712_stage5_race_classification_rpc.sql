create or replace function public.fia_record_race_result_entry(p_round_id uuid,p_member_id uuid,p_finish_status text,p_finishing_position integer default null,p_note text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v_round public.license_rounds%rowtype;v_member public.members%rowtype;v_id uuid;
begin
if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat mencatat klasifikasi race.';end if;
if p_finish_status not in ('finished','dnf','dns','dsq') then raise exception 'Status klasifikasi tidak valid.';end if;
if p_finish_status='finished' and (p_finishing_position is null or p_finishing_position<1) then raise exception 'Finishing position wajib berupa angka positif untuk driver yang finish.';end if;
if p_finish_status<>'finished' and p_finishing_position is not null then raise exception 'Finishing position harus kosong untuk status non-finish.';end if;
select * into v_round from public.license_rounds where id=p_round_id for update;
if not found or v_round.status<>'closed' then raise exception 'Klasifikasi hanya dapat dicatat untuk round yang sudah ditutup.';end if;
select * into v_member from public.members where id=p_member_id;
if not found or v_member.role<>'Driver' then raise exception 'Target klasifikasi harus merupakan Driver.';end if;
if not exists(select 1 from public.license_season_members sm where sm.season_division_id=v_round.season_division_id and sm.member_id=p_member_id and not sm.is_hiatus) then raise exception 'Driver tidak terdaftar aktif pada divisi season round ini.';end if;
insert into public.caleris_race_result_entries(round_id,member_id,team_id,finish_status,finishing_position,note,recorded_by,recorded_at)
values(p_round_id,p_member_id,v_member.team_id,p_finish_status,p_finishing_position,nullif(trim(p_note),''),(select auth.uid()),now())
on conflict(round_id,member_id) do update set team_id=excluded.team_id,finish_status=excluded.finish_status,finishing_position=excluded.finishing_position,note=excluded.note,recorded_by=excluded.recorded_by,recorded_at=now()
returning id into v_id;
return v_id;
end;$$;
revoke all on function public.fia_record_race_result_entry(uuid,uuid,text,integer,text) from public,anon,service_role;
grant execute on function public.fia_record_race_result_entry(uuid,uuid,text,integer,text) to authenticated;