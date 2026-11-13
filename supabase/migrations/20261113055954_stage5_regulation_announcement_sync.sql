create or replace function public.fia_publish_regulation(p_title text,p_body text,p_scope_kind text,p_division_key text default null,p_season_id uuid default null,p_version_label text default null) returns uuid language plpgsql security definer set search_path='' as $$
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