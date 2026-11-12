-- WDC score follows the driver's highest division achievement across seasons.
-- The award remains one row per member; its value tracks the current configuration
-- for the highest division the driver has won (it is never stacked).

-- Tier priority is configuration data, not an application-side score constant.
update public.caleris_configurations
set payload = payload || '{"tier_priority":2}'::jsonb,
    updated_at = now()
where category='license' and config_key='scoring-wdc-premio'
  and coalesce((payload->>'tier_priority')::integer,0)<>2;

update public.caleris_configurations
set payload = payload || '{"tier_priority":1}'::jsonb,
    updated_at = now()
where category='license' and config_key='scoring-wdc-zwei'
  and coalesce((payload->>'tier_priority')::integer,0)<>1;

-- Allow only trusted database workflows to revise the mutable score value and
-- achievement metadata. The award identity and original provenance remain fixed.
create or replace function public.guard_wdc_score_immutability()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_context text := current_setting('caleris.wdc_award_context', true);
begin
  if tg_op='DELETE' and old.source_type='wdc' then
    raise exception 'Catatan pencapaian WDC tidak dapat dihapus.';
  end if;

  if tg_op='UPDATE' and old.source_type='wdc' then
    if v_context is distinct from 'finalize' and v_context is distinct from 'config_sync' then
      raise exception 'Catatan WDC hanya dapat diperbarui oleh finalisasi juara atau sinkronisasi konfigurasi Admin.';
    end if;

    if new.id is distinct from old.id
       or new.member_id is distinct from old.member_id
       or new.season_id is distinct from old.season_id
       or new.season_division_id is distinct from old.season_division_id
       or new.source_type is distinct from old.source_type
       or new.idempotency_key is distinct from old.idempotency_key
       or new.created_at is distinct from old.created_at
       or new.points_delta < 0 then
      raise exception 'Identitas dan asal catatan WDC tidak boleh diubah.';
    end if;
    return new;
  end if;

  if tg_op='INSERT' and new.source_type='wdc' then
    if v_context is distinct from 'finalize' or new.points_delta<=0 then
      raise exception 'Bonus WDC hanya dapat diberikan melalui finalisasi juara yang tervalidasi.';
    end if;
  end if;

  if tg_op='UPDATE' and new.source_type='wdc' and old.source_type<>'wdc' then
    if v_context is distinct from 'finalize' or new.points_delta<=0 then
      raise exception 'Transaksi hanya dapat menjadi award WDC melalui finalisasi juara yang tervalidasi.';
    end if;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

-- Whenever an Admin changes a WDC points configuration, existing awards for
-- that division immediately follow the new configured value, across seasons.
create or replace function public.sync_wdc_scores_from_configuration()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_division_key text;
  v_points numeric;
  v_tier_priority integer;
begin
  if new.category<>'license' or new.config_key not in ('scoring-wdc-premio','scoring-wdc-zwei') then
    return new;
  end if;

  v_division_key := replace(new.config_key,'scoring-wdc-','');
  v_points := nullif(new.payload->>'points','')::numeric;
  v_tier_priority := nullif(new.payload->>'tier_priority','')::integer;

  -- Zero/invalid configuration disables future awards but must not erase an
  -- already-earned score. A later valid points update will synchronize it.
  if v_points is null or v_points<=0 or v_tier_priority is null or v_tier_priority<=0 then
    return new;
  end if;

  perform set_config('caleris.wdc_award_context','config_sync',true);
  update public.license_score_ledger
  set points_delta=v_points,
      metadata=metadata || jsonb_build_object(
        'configured_points',v_points,
        'points_config_key',new.config_key,
        'highest_tier_priority',v_tier_priority
      )
  where source_type='wdc'
    and coalesce(metadata->>'highest_division_key',metadata->>'division_key')=v_division_key;

  return new;
end;
$$;

drop trigger if exists sync_wdc_scores_from_configuration on public.caleris_configurations;
create trigger sync_wdc_scores_from_configuration
after insert or update on public.caleris_configurations
for each row execute function public.sync_wdc_scores_from_configuration();

revoke all on function public.sync_wdc_scores_from_configuration() from public,anon,authenticated,service_role;
revoke all on function public.guard_wdc_score_immutability() from public,anon,authenticated,service_role;

-- Finalization remains strictly validated. A champion's single WDC award is
-- created once, then upgraded only when the new title has a higher configured
-- tier priority. Winning the same/lower tier never stacks or downgrades points.
create or replace function public.finalize_license_division(p_season_division_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_division public.license_season_divisions%rowtype;
  v_season public.license_seasons%rowtype;
  v_champion public.license_final_standings%rowtype;
  v_existing public.license_score_ledger%rowtype;
  v_config_key text;
  v_points numeric;
  v_tier_priority integer;
  v_existing_priority integer;
  v_has_existing boolean:=false;
  v_round_count integer;
  v_open_round_count integer;
  v_final_count integer;
  v_registered_count integer;
  v_invalid_count integer;
  v_top_score_count integer;
  v_award_created boolean:=false;
  v_award_upgraded boolean:=false;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Hanya Admin yang dapat mengesahkan juara WDC.';
  end if;

  select * into v_division from public.license_season_divisions
  where id=p_season_division_id for update;
  if not found then raise exception 'Divisi season tidak ditemukan.'; end if;
  if v_division.status='completed' then raise exception 'Divisi ini sudah difinalisasi.'; end if;

  select * into v_season from public.license_seasons where id=v_division.season_id;
  if v_season.status<>'active' then raise exception 'Season harus berstatus aktif untuk mengesahkan WDC.'; end if;

  select count(*),count(*) filter(where status<>'closed')
  into v_round_count,v_open_round_count
  from public.license_rounds where season_division_id=p_season_division_id;
  if v_round_count=0 or v_open_round_count>0 then
    raise exception 'Semua round harus tersedia dan diproses sebelum WDC disahkan.';
  end if;

  select count(*) into v_final_count from public.license_final_standings
  where season_division_id=p_season_division_id;
  select count(*) into v_registered_count from public.license_season_members
  where season_division_id=p_season_division_id and not is_hiatus;
  if v_final_count=0 or v_final_count<>v_registered_count then
    raise exception 'Final standings harus memuat seluruh driver aktif yang terdaftar pada divisi ini.';
  end if;

  select count(*) into v_invalid_count
  from public.license_final_standings fs
  left join public.license_season_members sm
    on sm.season_division_id=fs.season_division_id and sm.member_id=fs.member_id
  left join public.members m on m.id=fs.member_id
  where fs.season_division_id=p_season_division_id
    and (sm.id is null or sm.is_hiatus or m.role is distinct from 'Driver');
  if v_invalid_count>0 then
    raise exception 'Final standings memuat peserta yang bukan Driver aktif terdaftar.';
  end if;

  select count(*) into v_round_count from public.license_final_standings
  where season_division_id=p_season_division_id and final_position=1;
  if v_round_count<>1 then raise exception 'WDC harus memiliki tepat satu juara posisi pertama.'; end if;

  select * into v_champion from public.license_final_standings
  where season_division_id=p_season_division_id and final_position=1;

  select count(*) into v_top_score_count from public.license_final_standings
  where season_division_id=p_season_division_id and final_points=v_champion.final_points;
  if v_top_score_count<>1 or exists(
    select 1 from public.license_final_standings
    where season_division_id=p_season_division_id and final_points>v_champion.final_points
  ) then
    raise exception 'Juara harus memiliki poin akhir tertinggi secara tunggal.';
  end if;

  v_config_key:='scoring-wdc-'||v_division.division_key;
  select nullif(payload->>'points','')::numeric,
         nullif(payload->>'tier_priority','')::integer
  into v_points,v_tier_priority
  from public.caleris_configurations
  where category='license' and config_key=v_config_key and is_active;
  if v_points is null or v_points<=0 or v_tier_priority is null or v_tier_priority<=0 then
    raise exception 'Poin dan prioritas tier WDC untuk divisi ini belum diatur atau belum diaktifkan Admin.';
  end if;

  -- Serialize all award/upgrades for the same driver across seasons/divisions.
  perform pg_advisory_xact_lock(hashtextextended(v_champion.member_id::text,0));

  select * into v_existing from public.license_score_ledger
  where member_id=v_champion.member_id and source_type='wdc'
  for update;
  v_has_existing := found;

  perform set_config('caleris.wdc_award_context','finalize',true);

  if not v_has_existing then
    insert into public.license_score_ledger(
      member_id,season_id,season_division_id,source_type,points_delta,
      idempotency_key,description,metadata
    ) values (
      v_champion.member_id,v_division.season_id,p_season_division_id,'wdc',v_points,
      'wdc-lifetime:'||v_champion.member_id::text,
      'Official WDC Champion · '||v_division.division_name,
      jsonb_build_object(
        'highest_division_key',v_division.division_key,
        'highest_division_name',v_division.division_name,
        'highest_wdc_season_id',v_division.season_id,
        'highest_wdc_season_division_id',p_season_division_id,
        'highest_tier_priority',v_tier_priority,
        'configured_points',v_points,
        'points_config_key',v_config_key,
        'awarded_once_lifetime',true
      )
    );
    v_award_created:=true;
  else
    v_existing_priority:=coalesce(
      nullif(v_existing.metadata->>'highest_tier_priority','')::integer,
      nullif(v_existing.metadata->>'tier_priority','')::integer,
      0
    );

    if v_tier_priority>v_existing_priority then
      update public.license_score_ledger
      set points_delta=v_points,
          description='Official WDC Champion · '||v_division.division_name,
          metadata=metadata || jsonb_build_object(
            'highest_division_key',v_division.division_key,
            'highest_division_name',v_division.division_name,
            'highest_wdc_season_id',v_division.season_id,
            'highest_wdc_season_division_id',p_season_division_id,
            'highest_tier_priority',v_tier_priority,
            'configured_points',v_points,
            'points_config_key',v_config_key,
            'upgraded_at',now()
          )
      where id=v_existing.id;
      v_award_upgraded:=true;
    end if;
  end if;

  update public.license_season_divisions
  set status='completed',finalized_at=now(),finalized_by=(select auth.uid())
  where id=p_season_division_id;

  return jsonb_build_object(
    'division_id',p_season_division_id,
    'champion_member_id',v_champion.member_id,
    'wdc_score',case when v_award_created or v_award_upgraded then v_points else v_existing.points_delta end,
    'award_created',v_award_created,
    'award_upgraded',v_award_upgraded,
    'highest_division_key',case when v_award_created or v_award_upgraded then v_division.division_key else v_existing.metadata->>'highest_division_key' end,
    'status','completed'
  );
end;
$$;

revoke all on function public.finalize_license_division(uuid) from public,anon,service_role;
grant execute on function public.finalize_license_division(uuid) to authenticated;
