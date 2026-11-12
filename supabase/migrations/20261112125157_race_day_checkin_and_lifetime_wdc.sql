-- Race-day-only check-in and lifetime immutable WDC recognition.
alter table public.license_daily_checkins add column if not exists round_id uuid references public.license_rounds(id) on delete restrict;
alter table public.license_daily_checkins drop constraint if exists license_daily_checkins_member_id_checkin_date_key;
alter table public.license_daily_checkins alter column round_id set not null;
create unique index if not exists license_daily_checkins_member_round_uidx on public.license_daily_checkins(member_id,round_id);
create index if not exists license_daily_checkins_round_idx on public.license_daily_checkins(round_id,checkin_date);

alter table public.license_rounds drop constraint if exists license_rounds_same_race_day_check;
alter table public.license_rounds add constraint license_rounds_same_race_day_check
 check((checkin_opens_at at time zone 'Asia/Jakarta')::date=(checkin_closes_at at time zone 'Asia/Jakarta')::date);

create or replace function public.license_apply_checkin_score()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_season_id uuid;
 v_division_id uuid;
 v_points numeric;
 v_config public.caleris_configurations%rowtype;
 v_round public.license_rounds%rowtype;
begin
 select * into v_round from public.license_rounds r where r.id=new.round_id for update;
 if not found then raise exception 'Jadwal race tidak ditemukan.';end if;
 if v_round.status='closed' then raise exception 'Periode check-in race ini sudah ditutup.';end if;
 if new.checkin_date<>(now() at time zone 'Asia/Jakarta')::date
    or new.checkin_date<>(v_round.checkin_opens_at at time zone 'Asia/Jakarta')::date
    or new.checkin_date<>(v_round.checkin_closes_at at time zone 'Asia/Jakarta')::date then
  raise exception 'Absensi hanya dapat dilakukan pada tanggal race yang dijadwalkan.';
 end if;
 if now()<v_round.checkin_opens_at or now()>v_round.checkin_closes_at then
  raise exception 'Periode absensi race ini belum dibuka atau sudah ditutup.';
 end if;
 select sm.season_id,sm.season_division_id into v_season_id,v_division_id
 from public.license_season_members sm
 join public.license_seasons s on s.id=sm.season_id and s.status='active'
 join public.license_season_divisions sd on sd.id=sm.season_division_id and sd.status='active'
 where sm.member_id=new.member_id and not sm.is_hiatus and sm.season_id=(
  select sd2.season_id from public.license_season_divisions sd2 where sd2.id=v_round.season_division_id
 ) and sm.season_division_id=v_round.season_division_id
 and new.checkin_date between s.starts_on and s.ends_on;
 if v_season_id is null then raise exception 'Driver tidak terdaftar pada divisi aktif untuk race ini.';end if;
 if not exists(select 1 from public.members m where m.id=new.member_id and m.role='Driver') then
  raise exception 'Hanya Driver yang dapat melakukan absensi race.';
 end if;
 select c.* into v_config from public.caleris_configurations c
 where c.category='license' and c.config_key='scoring-daily-checkin' and c.is_active;
 v_points:=nullif(v_config.payload->>'points','')::numeric;
 if v_points is null or v_points<=0 then raise exception 'Konfigurasi poin race check-in belum valid.';end if;
 insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
 values(new.member_id,v_season_id,v_division_id,'daily_checkin',v_points,'checkin:'||new.id::text,
 'Race check-in · Round '||v_round.round_number,
 jsonb_build_object('checkin_id',new.id,'round_id',v_round.id,'round_number',v_round.round_number,'checkin_date',new.checkin_date));
 return new;
end;$$;
drop trigger if exists license_daily_checkin_score on public.license_daily_checkins;
create trigger license_daily_checkin_score after insert on public.license_daily_checkins
for each row execute function public.license_apply_checkin_score();
revoke all on function public.license_apply_checkin_score() from public,anon,authenticated,service_role;

-- A WDC score belongs to a driver once for their lifetime. It is never mutable or deletable.
drop index if exists public.license_one_wdc_award_per_division_uidx;
create unique index if not exists license_one_wdc_award_per_member_uidx
on public.license_score_ledger(member_id) where source_type='wdc';

create or replace function public.guard_wdc_score_immutability()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' or tg_op='DELETE' then
  if old.source_type='wdc' then raise exception 'Bonus WDC bersifat permanen dan tidak dapat diubah atau dihapus.';end if;
 end if;
 if tg_op='INSERT' and new.source_type='wdc' then
  if current_setting('caleris.wdc_award_context',true) is distinct from 'finalize'
     or new.points_delta<=0 then
   raise exception 'Bonus WDC hanya dapat diberikan melalui proses finalisasi juara yang tervalidasi.';
  end if;
 end if;
 if tg_op='UPDATE' and new.source_type='wdc' and old.source_type<>'wdc' then
  raise exception 'Transaksi lain tidak dapat diubah menjadi bonus WDC.';
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end;$$;
drop trigger if exists license_wdc_score_immutable on public.license_score_ledger;
create trigger license_wdc_score_immutable before insert or update or delete on public.license_score_ledger
for each row execute function public.guard_wdc_score_immutability();
revoke all on function public.guard_wdc_score_immutability() from public,anon,authenticated,service_role;

create or replace function public.finalize_license_division(p_season_division_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_division public.license_season_divisions%rowtype;
 v_season public.license_seasons%rowtype;
 v_champion public.license_final_standings%rowtype;
 v_config_key text;
 v_points numeric;
 v_round_count integer;
 v_open_round_count integer;
 v_final_count integer;
 v_registered_count integer;
 v_invalid_count integer;
 v_top_score_count integer;
 v_awarded integer:=0;
 v_already_has_wdc boolean:=false;
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
  raise exception 'Hanya Admin yang dapat mengesahkan juara WDC.';
 end if;
 select * into v_division from public.license_season_divisions where id=p_season_division_id for update;
 if not found then raise exception 'Divisi season tidak ditemukan.';end if;
 if v_division.status='completed' then raise exception 'Divisi ini sudah difinalisasi.';end if;
 select * into v_season from public.license_seasons where id=v_division.season_id;
 if v_season.status<>'active' then raise exception 'Season harus berstatus aktif untuk mengesahkan WDC.';end if;
 select count(*),count(*) filter(where status<>'closed') into v_round_count,v_open_round_count
 from public.license_rounds where season_division_id=p_season_division_id;
 if v_round_count=0 or v_open_round_count>0 then raise exception 'Semua round harus tersedia dan diproses sebelum WDC disahkan.';end if;
 select count(*) into v_final_count from public.license_final_standings where season_division_id=p_season_division_id;
 select count(*) into v_registered_count from public.license_season_members where season_division_id=p_season_division_id and not is_hiatus;
 if v_final_count=0 or v_final_count<>v_registered_count then
  raise exception 'Final standings harus memuat seluruh driver aktif yang terdaftar pada divisi ini.';
 end if;
 select count(*) into v_invalid_count from public.license_final_standings fs
 left join public.license_season_members sm on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id
 left join public.members m on m.id=fs.member_id
 where fs.season_division_id=p_season_division_id and (sm.id is null or sm.is_hiatus or m.role is distinct from 'Driver');
 if v_invalid_count>0 then raise exception 'Final standings memuat peserta yang bukan Driver aktif terdaftar.';end if;
 select count(*) into v_round_count from public.license_final_standings
 where season_division_id=p_season_division_id and final_position=1;
 if v_round_count<>1 then raise exception 'WDC harus memiliki tepat satu juara posisi pertama.';end if;
 select * into v_champion from public.license_final_standings
 where season_division_id=p_season_division_id and final_position=1;
 select count(*) into v_top_score_count from public.license_final_standings
 where season_division_id=p_season_division_id and final_points=v_champion.final_points;
 if v_top_score_count<>1 or exists(select 1 from public.license_final_standings
  where season_division_id=p_season_division_id and final_points>v_champion.final_points) then
  raise exception 'Juara harus memiliki poin akhir tertinggi secara tunggal.';
 end if;

 -- Serialize awards for this member across Premio, Zwei, and all seasons.
 perform pg_advisory_xact_lock(hashtextextended(v_champion.member_id::text,0));
 select exists(select 1 from public.license_score_ledger
  where member_id=v_champion.member_id and source_type='wdc') into v_already_has_wdc;
 if not v_already_has_wdc then
  v_config_key:='scoring-wdc-'||v_division.division_key;
  select nullif(payload->>'points','')::numeric into v_points
  from public.caleris_configurations
  where category='license' and config_key=v_config_key and is_active;
  if v_points is null or v_points<=0 then
   raise exception 'Poin WDC untuk divisi ini belum diatur atau belum diaktifkan oleh Admin.';
  end if;
  perform set_config('caleris.wdc_award_context','finalize',true);
  insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
  values(v_champion.member_id,v_division.season_id,p_season_division_id,'wdc',v_points,
   'wdc-lifetime:'||v_champion.member_id::text,'Official WDC Champion · '||v_division.division_name,
   jsonb_build_object('final_position',v_champion.final_position,'final_points',v_champion.final_points,
    'division_key',v_division.division_key,'awarded_once_lifetime',true));
  get diagnostics v_awarded=row_count;
 else
  v_points:=0;
 end if;
 update public.license_season_divisions set status='completed',finalized_at=now(),finalized_by=(select auth.uid())
 where id=p_season_division_id;
 return jsonb_build_object('division_id',p_season_division_id,'champion_member_id',v_champion.member_id,
  'wdc_points_awarded',coalesce(v_points,0),'awarded_this_time',v_awarded=1,
  'already_owned_lifetime',v_already_has_wdc,'status','completed');
end;$$;
revoke all on function public.finalize_license_division(uuid) from public,anon,service_role;
grant execute on function public.finalize_license_division(uuid) to authenticated;
