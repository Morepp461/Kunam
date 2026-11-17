create or replace function public.admin_set_sponsor_offer_band(p_sponsor_id uuid,p_minimum numeric,p_maximum numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_minimum is null or p_maximum is null or p_minimum<=0 or p_maximum<p_minimum or p_maximum<>round(p_maximum,2) or p_minimum<>round(p_minimum,2) then
  raise exception 'Rentang nilai penawaran tidak valid.';
 end if;
 update public.caleris_sponsors set target_audience=coalesce(target_audience,'{}'::jsonb)||
  jsonb_build_object('offer_amount_min',p_minimum,'offer_amount_max',p_maximum),updated_at=now()
 where id=p_sponsor_id;
 if not found then raise exception 'Sponsor tidak ditemukan.'; end if;
end $$;
revoke all on function public.admin_set_sponsor_offer_band(uuid,numeric,numeric) from public,anon;
grant execute on function public.admin_set_sponsor_offer_band(uuid,numeric,numeric) to authenticated;
