-- Harden editable scoring maps and normalize Achievement against the full active-season calendar.
begin;

do $$
declare
  v_definition text;
  v_old_license text:= $old$v_license:=coalesce(nullif(c.initial_license_scores->>v_license_key,'')::numeric,25);$old$;
  v_new_license text:= $new$select e.value::numeric into v_license
    from jsonb_each_text(c.initial_license_scores) e
    where lower(e.key)=lower(v_license_key) limit 1;
    v_license:=coalesce(v_license,25);$new$;
  v_old_achievement text:= $old$select count(*) into v_round_count
    from public.license_rounds r
    join public.license_season_divisions sd on sd.id=r.season_division_id
    where sd.season_id=v_season_id and (v_division_id is null or sd.id=v_division_id)
      and exists(select 1 from public.caleris_race_results rr where rr.round_id=r.id and rr.published_at is not null);
    v_achievement_max:=v_round_count*6;$old$;
  v_new_achievement text:= $new$select count(*) into v_round_count
    from public.license_rounds r
    join public.license_season_divisions sd on sd.id=r.season_division_id
    where sd.season_id=v_season_id and (v_division_id is null or sd.id=v_division_id);
    v_achievement_max:=v_round_count*6;$new$;
begin
  v_definition:=pg_get_functiondef('private.recalculate_driver_market_values_raw(uuid,text)'::regprocedure);
  if position(v_old_license in v_definition)=0 then
    raise exception 'Market Value license lookup anchor not found; aborting safe function patch.';
  end if;
  if position(v_old_achievement in v_definition)=0 then
    raise exception 'Market Value Achievement normalization anchor not found; aborting safe function patch.';
  end if;
  v_definition:=replace(v_definition,v_old_license,v_new_license);
  v_definition:=replace(v_definition,v_old_achievement,v_new_achievement);
  execute v_definition;
end;
$$;

create or replace function public.admin_configure_driver_market(
  p_weights jsonb,
  p_base_value_eur numeric,
  p_growth_factor numeric,
  p_tier_multipliers jsonb,
  p_tier_order jsonb,
  p_initial_license_scores jsonb
) returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_total numeric;
  v_tier_count integer;
  v_max_tier integer;
  v_order_count integer;
  v_unique_order_count integer;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Admin access required.';
  end if;
  if p_base_value_eur is null or p_base_value_eur<=0
    or p_growth_factor is null or p_growth_factor<0 or p_growth_factor>1 then
    raise exception 'Base Value atau Growth Factor tidak valid.';
  end if;
  if jsonb_typeof(p_weights) is distinct from 'object'
    or jsonb_typeof(p_tier_multipliers) is distinct from 'object'
    or jsonb_typeof(p_tier_order) is distinct from 'object'
    or jsonb_typeof(p_initial_license_scores) is distinct from 'object' then
    raise exception 'Format konfigurasi tidak valid.';
  end if;
  if not (p_weights ?& array['license','contract','performance','skill','achievement','activity','reputation'])
    or (select count(*) from jsonb_object_keys(p_weights))<>7 then
    raise exception 'Tujuh key bobot scoring wajib lengkap dan tidak boleh diganti.';
  end if;
  select sum(value::numeric) into v_total from jsonb_each_text(p_weights);
  if v_total<>100 then raise exception 'Bobot tujuh komponen harus berjumlah tepat 100 persen.'; end if;
  if exists(select 1 from jsonb_each_text(p_weights) x where x.value::numeric<0 or x.value::numeric>100) then
    raise exception 'Bobot komponen harus berada pada rentang 0–100.';
  end if;
  if (p_tier_multipliers->>'1')::numeric is distinct from 1.0 then
    raise exception 'Tier 1 harus menggunakan multiplier 1,00.';
  end if;
  if exists(select 1 from jsonb_each_text(p_tier_multipliers) x
    where x.key !~ '^[1-9][0-9]*$' or x.value::numeric<=0 or x.value::numeric>1) then
    raise exception 'Tier multiplier harus memiliki nomor tier positif dan nilai lebih dari 0 hingga 1.';
  end if;
  select count(*),max(key::integer) into v_tier_count,v_max_tier from jsonb_object_keys(p_tier_multipliers) as k(key);
  if v_tier_count<>v_max_tier then raise exception 'Nomor Tier Multiplier harus berurutan tanpa celah.'; end if;
  if exists(select 1 from jsonb_each_text(p_tier_order) x where x.value::integer<1) then
    raise exception 'Urutan tier harus berupa bilangan bulat positif.';
  end if;
  select count(*),count(distinct value::integer) into v_order_count,v_unique_order_count from jsonb_each_text(p_tier_order);
  if v_order_count<>v_unique_order_count then raise exception 'Setiap division_key harus memiliki urutan tier yang unik.'; end if;
  if not (p_initial_license_scores ?& array['Bronze','Silver','Gold','Super License']) then
    raise exception 'Skor Bronze, Silver, Gold, dan Super License wajib tersedia.';
  end if;
  if exists(select 1 from jsonb_each_text(p_initial_license_scores) x where x.value::numeric<0 or x.value::numeric>100) then
    raise exception 'License Score harus berada pada rentang 0–100.';
  end if;
  insert into public.caleris_driver_market_config(
    id,weights,base_value_eur,growth_factor,tier_multipliers,tier_order,initial_license_scores,updated_at,updated_by
  ) values(true,p_weights,p_base_value_eur,p_growth_factor,p_tier_multipliers,p_tier_order,p_initial_license_scores,now(),auth.uid())
  on conflict(id) do update set
    weights=excluded.weights,
    base_value_eur=excluded.base_value_eur,
    growth_factor=excluded.growth_factor,
    tier_multipliers=excluded.tier_multipliers,
    tier_order=excluded.tier_order,
    initial_license_scores=excluded.initial_license_scores,
    updated_at=now(),
    updated_by=auth.uid();
end;
$$;

revoke all on function public.admin_configure_driver_market(jsonb,numeric,numeric,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.admin_configure_driver_market(jsonb,numeric,numeric,jsonb,jsonb,jsonb) to authenticated;

select private.recalculate_driver_market_values(null,'scoring_normalization');

commit;
