begin;

alter table public.caleris_rewarded_ads_config
  add column if not exists server_verification_ready boolean not null default false;

create or replace function public.admin_update_rewarded_ads_config(
  p_is_enabled boolean,
  p_milestones jsonb,
  p_gam_network_code text default null,
  p_gam_ad_unit_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=(select auth.uid());
  v_milestones jsonb;
  v_verification_ready boolean;
begin
  if v_user is null or not exists(select 1 from public.site_admins a where a.user_id=v_user) then
    raise exception 'Hanya Admin yang dapat mengubah konfigurasi Rewarded Ads.';
  end if;
  if jsonb_typeof(p_milestones)<>'array' or jsonb_array_length(p_milestones)<>3 then
    raise exception 'Konfigurasi milestone harus berisi tepat tiga tingkat.';
  end if;
  if (p_milestones->0->>'ads')::integer<>1 or (p_milestones->1->>'ads')::integer<>3 or (p_milestones->2->>'ads')::integer<>5 then
    raise exception 'Milestone iklan harus 1, 3, dan 5.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_milestones) x where coalesce((x->>'reward')::numeric,0)<=0) then
    raise exception 'Reward setiap milestone harus lebih besar dari nol.';
  end if;
  select server_verification_ready into v_verification_ready
  from public.caleris_rewarded_ads_config where singleton=true for update;
  if p_is_enabled and not coalesce(v_verification_ready,false) then
    raise exception 'Rewarded Ads belum dapat diaktifkan sebelum server-side verification Google selesai dikonfigurasi dan diuji.';
  end if;
  if p_is_enabled and (nullif(trim(p_gam_network_code),'') is null or nullif(trim(p_gam_ad_unit_path),'') is null) then
    raise exception 'Rewarded Ads tidak dapat diaktifkan sebelum Network Code dan Ad Unit Path GAM tersedia.';
  end if;
  v_milestones:=p_milestones;
  update public.caleris_rewarded_ads_config
  set is_enabled=p_is_enabled,milestones=v_milestones,
      gam_network_code=nullif(trim(p_gam_network_code),''),
      gam_ad_unit_path=nullif(trim(p_gam_ad_unit_path),''),
      updated_by=v_user,updated_at=now()
  where singleton=true;
  return public.admin_get_rewarded_ads_config();
end;
$function$;

commit;
