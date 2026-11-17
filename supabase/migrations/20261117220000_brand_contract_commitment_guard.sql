-- Protect full multi-season commitments and reserve the configured seasonal bonus pool.
create or replace function private.create_sponsorship_contract_from_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_offer public.caleris_sponsorship_offers%rowtype;v_revision public.caleris_sponsorship_offer_revisions%rowtype;v_id uuid;v_duration integer;v_available integer;
begin
 select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
 if not found then raise exception 'Sponsorship offer not found.'; end if;
 if v_offer.target_kind<>'team' or v_offer.target_team_id is null then raise exception 'New sponsorship contracts are team-only.'; end if;
 if v_offer.status not in ('offered','negotiating') then raise exception 'Sponsorship offer is no longer open.'; end if;
 select * into v_revision from public.caleris_sponsorship_offer_revisions where offer_id=p_offer_id order by created_at desc,id desc limit 1;
 if not found then raise exception 'Sponsorship offer revision is missing.'; end if;
 select greatest(1,least(5,coalesce(nullif(v_revision.terms->>'duration_seasons','')::integer,
  (select default_duration_seasons from public.caleris_sponsors where id=v_offer.sponsor_id),1))) into v_duration;
 select count(*) into v_available from public.license_seasons where starts_on >= (select starts_on from public.license_seasons where id=v_offer.season_id);
 if v_available<v_duration then raise exception 'Season berikutnya belum dikonfigurasi untuk memenuhi durasi kontrak (% season).',v_duration; end if;
 insert into public.caleris_sponsorship_contracts(offer_id,sponsor_id,target_kind,target_member_id,target_team_id,season_id,contract_amount,terms,status)
 values(v_offer.id,v_offer.sponsor_id,'team',null,v_offer.target_team_id,v_offer.season_id,v_revision.amount,v_revision.terms,'active')
 returning id into v_id;
 update public.caleris_sponsorship_offers set proposed_amount=v_revision.amount,terms=v_revision.terms,status='accepted' where id=v_offer.id;
 update public.caleris_sponsorship_offer_revisions set response='accepted' where id=v_revision.id;
 return v_id;
end $$;

create or replace function public.admin_process_sponsorship_payments()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 return private.process_brand_ecosystem_scheduled_settlements();
end $$;
create or replace function public.admin_process_sponsorship_bonuses()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 return private.process_brand_ecosystem_scheduled_settlements();
end $$;

update public.caleris_sponsors
set available_budget=greatest(available_budget,round((target_audience->>'base_amount')::numeric*default_duration_seasons*1.5,2))
where source_code is not null and target_audience ? 'base_amount'
 and not exists(select 1 from public.caleris_sponsorship_contracts c where c.sponsor_id=caleris_sponsors.id);
