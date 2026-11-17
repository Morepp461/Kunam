create or replace function public.admin_set_brand_ecosystem_config(p_key text,p_value jsonb,p_description text)
returns void language plpgsql security definer set search_path='' as $$
declare v_total numeric;v_entry record;v_division jsonb;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_key is null or length(trim(p_key)) not between 2 and 80 or jsonb_typeof(p_value)<>'object' then raise exception 'Konfigurasi tidak valid.'; end if;
 if p_key in ('team_reputation_weights','driver_reputation_weights','sponsor_trust_weights') then
  select sum(value::numeric) into v_total from jsonb_each_text(p_value);
  if v_total is null or v_total<=0 or exists(select 1 from jsonb_each_text(p_value) e where e.value::numeric<0) then raise exception 'Bobot harus bernilai non-negatif dan totalnya lebih dari nol.'; end if;
 elsif p_key='bonus_pool_percent' then
  if coalesce((p_value->>'value')::numeric,-1)<0 or (p_value->>'value')::numeric>100 then raise exception 'Bonus pool harus 0 sampai 100 persen.'; end if;
 elsif p_key='sponsor_division_probabilities' then
  for v_entry in select key,value from jsonb_each(p_value) loop
   if jsonb_typeof(v_entry.value)<>'object' then raise exception 'Probabilitas divisi tidak valid.'; end if;
   select sum(value::numeric) into v_total from jsonb_each_text(v_entry.value);
   if abs(coalesce(v_total,0)-100)>0.01 or exists(select 1 from jsonb_each_text(v_entry.value) e where e.value::numeric<0 or e.value::numeric>100) then
    raise exception 'Probabilitas tier untuk divisi % harus berjumlah 100 persen.',v_entry.key;
   end if;
  end loop;
 elsif p_key='sponsor_focus_targets' then
  for v_entry in select key,value from jsonb_each(p_value) loop
   if jsonb_typeof(v_entry.value)<>'object' or exists(select 1 from jsonb_each_text(v_entry.value) e where e.value::numeric<0 or e.value::numeric>100) then
    raise exception 'Target fokus sponsor harus 0 sampai 100.';
   end if;
  end loop;
 end if;
 insert into public.caleris_brand_ecosystem_config(config_key,config_value,description,updated_by)
 values(trim(p_key),p_value,coalesce(nullif(trim(p_description),''),'Brand ecosystem configuration'),(select auth.uid()))
 on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=excluded.updated_by,updated_at=now();
end $$;
