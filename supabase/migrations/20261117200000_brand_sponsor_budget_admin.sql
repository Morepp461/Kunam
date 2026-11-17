create or replace function public.admin_set_sponsor_budget(p_sponsor_id uuid,p_budget numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_reserved numeric;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_budget is null or p_budget<0 or p_budget<>round(p_budget,2) then raise exception 'Budget sponsor tidak valid.'; end if;
 select coalesce((select sum(amount) from public.caleris_sponsorship_payment_schedule where contract_id in(select id from public.caleris_sponsorship_contracts where sponsor_id=p_sponsor_id and status='active') and status='scheduled'),0)
  +coalesce((select sum(pool_total-pool_paid) from public.caleris_sponsorship_season_bonus_pools where contract_id in(select id from public.caleris_sponsorship_contracts where sponsor_id=p_sponsor_id and status='active')),0)
 into v_reserved;
 if p_budget<v_reserved then raise exception 'Budget tidak boleh di bawah komitmen kontrak yang belum dibayar (%).',v_reserved; end if;
 update public.caleris_sponsors set available_budget=p_budget,updated_at=now() where id=p_sponsor_id;
 if not found then raise exception 'Sponsor tidak ditemukan.'; end if;
end $$;
revoke all on function public.admin_set_sponsor_budget(uuid,numeric) from public,anon;
grant execute on function public.admin_set_sponsor_budget(uuid,numeric) to authenticated;
