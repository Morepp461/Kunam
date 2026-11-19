-- Keep Admin manual reputation recalculation compatible with new character signals.
CREATE OR REPLACE FUNCTION public.admin_calculate_driver_reputation(p_member_id uuid, p_metrics jsonb, p_source_event text DEFAULT 'season_evaluation'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_weights jsonb;v_total numeric:=0;v_weight numeric:=0;v_item record;v_value numeric;v_score integer;v_metrics jsonb;v_existing_metrics jsonb;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if jsonb_typeof(p_metrics)<>'object' or not exists(select 1 from public.members where id=p_member_id and role='Driver') then raise exception 'Driver atau metrics tidak valid.'; end if;
 select metrics into v_existing_metrics from public.caleris_driver_reputation where member_id=p_member_id;
 v_metrics:=p_metrics||jsonb_build_object(
  'form',coalesce((p_metrics->>'form')::numeric,(v_existing_metrics->>'form')::numeric,50),
  'morale',coalesce((p_metrics->>'morale')::numeric,(v_existing_metrics->>'morale')::numeric,50),
  'confidence',coalesce((p_metrics->>'confidence')::numeric,(v_existing_metrics->>'confidence')::numeric,50)
 );
 select config_value into v_weights from public.caleris_brand_ecosystem_config where config_key='driver_reputation_weights';
 for v_item in select key,value from jsonb_each(v_weights) loop
  v_value:=coalesce((v_metrics->>v_item.key)::numeric,0);
  if v_value<0 or v_value>100 then raise exception 'Metrik % harus 0 sampai 100.',v_item.key; end if;
  v_total:=v_total+v_value*(v_item.value#>>'{}')::numeric;
  v_weight:=v_weight+(v_item.value#>>'{}')::numeric;
 end loop;
 if v_weight<=0 then raise exception 'Bobot Driver Reputation tidak valid.'; end if;
 v_score:=round((v_total/v_weight)*99.99)::integer;
 return public.admin_set_driver_reputation(p_member_id,v_score,v_metrics,p_source_event);
end $function$

