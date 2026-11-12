create unique index if not exists license_one_active_season_uidx on public.license_seasons((status)) where status='active';
create unique index if not exists license_one_wdc_award_per_division_uidx on public.license_score_ledger(season_division_id) where source_type='wdc';
create or replace function public.finalize_license_division(p_season_division_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_division public.license_season_divisions%rowtype;v_season public.license_seasons%rowtype;v_champion public.license_final_standings%rowtype;v_config_key text;v_points numeric;v_round_count integer;v_open_round_count integer;v_final_count integer;v_registered_count integer;v_invalid_count integer;v_top_score_count integer;
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat mengesahkan juara WDC.';end if;
 select * into v_division from public.license_season_divisions where id=p_season_division_id for update;if not found then raise exception 'Divisi season tidak ditemukan.';end if;
 if v_division.status='completed' then raise exception 'Divisi ini sudah difinalisasi. Bonus WDC tidak dapat diberikan ulang.';end if;
 select * into v_season from public.license_seasons where id=v_division.season_id;if v_season.status<>'active' then raise exception 'Season harus berstatus aktif untuk mengesahkan WDC.';end if;
 select count(*),count(*) filter(where status<>'closed') into v_round_count,v_open_round_count from public.license_rounds where season_division_id=p_season_division_id;
 if v_round_count=0 or v_open_round_count>0 then raise exception 'Semua round harus tersedia dan diproses sebelum WDC disahkan.';end if;
 select count(*) into v_final_count from public.license_final_standings where season_division_id=p_season_division_id;
 select count(*) into v_registered_count from public.license_season_members where season_division_id=p_season_division_id and not is_hiatus;
 if v_final_count=0 or v_final_count<>v_registered_count then raise exception 'Final standings harus memuat seluruh driver aktif yang terdaftar pada divisi ini.';end if;
 select count(*) into v_invalid_count from public.license_final_standings fs
 left join public.license_season_members sm on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id
 left join public.members m on m.id=fs.member_id
 where fs.season_division_id=p_season_division_id and (sm.id is null or sm.is_hiatus or m.role is distinct from 'Driver');
 if v_invalid_count>0 then raise exception 'Final standings memuat peserta yang bukan Driver aktif terdaftar.';end if;
 select count(*) into v_round_count from public.license_final_standings where season_division_id=p_season_division_id and final_position=1;
 if v_round_count<>1 then raise exception 'WDC harus memiliki tepat satu juara posisi pertama.';end if;
 select * into v_champion from public.license_final_standings where season_division_id=p_season_division_id and final_position=1;
 select count(*) into v_top_score_count from public.license_final_standings where season_division_id=p_season_division_id and final_points=v_champion.final_points;
 if v_top_score_count<>1 or exists(select 1 from public.license_final_standings where season_division_id=p_season_division_id and final_points>v_champion.final_points) then raise exception 'Juara harus memiliki poin akhir tertinggi secara tunggal. Hasil seri perlu keputusan resmi sebelum WDC disahkan.';end if;
 v_config_key:='scoring-wdc-'||v_division.division_key;
 select nullif(payload->>'points','')::numeric into v_points from public.caleris_configurations where category='license' and config_key=v_config_key and is_active;
 if v_points is null or v_points<=0 then raise exception 'Poin WDC untuk divisi ini belum diatur atau belum diaktifkan oleh Admin.';end if;
 insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
 values(v_champion.member_id,v_division.season_id,p_season_division_id,'wdc',v_points,'wdc:'||p_season_division_id::text||':'||v_champion.member_id::text,'Official WDC Champion · '||v_division.division_name,jsonb_build_object('final_position',v_champion.final_position,'final_points',v_champion.final_points,'division_key',v_division.division_key));
 update public.license_season_divisions set status='completed',finalized_at=now(),finalized_by=(select auth.uid()) where id=p_season_division_id;
 return jsonb_build_object('division_id',p_season_division_id,'champion_member_id',v_champion.member_id,'wdc_points',v_points,'status','completed');
end;$$;
revoke all on function public.finalize_license_division(uuid) from public,anon,service_role;
grant execute on function public.finalize_license_division(uuid) to authenticated;
