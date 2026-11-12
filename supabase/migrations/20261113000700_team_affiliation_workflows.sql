-- Team affiliation requests: one pending or accepted affiliate per team, across different tiers.
create or replace function public.member_request_team_affiliation(p_target_team_id uuid,p_agreement jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid());v_member public.members%rowtype;v_own public.teams%rowtype;v_target public.teams%rowtype;
 v_a uuid;v_b uuid;v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required.'; end if;
 select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
 if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Hanya Team Owner/Principal yang terhubung ke tim dapat mengajukan afiliasi.'; end if;
 select * into v_own from public.teams where id=v_member.team_id;
 select * into v_target from public.teams where id=p_target_team_id;
 if v_target.id is null or v_target.id=v_own.id then raise exception 'Tim tujuan tidak valid.'; end if;
 if v_own.division_key is null or v_target.division_key is null then raise exception 'Admin harus menetapkan tier kedua tim sebelum afiliasi dibuat.'; end if;
 if v_own.division_key=v_target.division_key then raise exception 'Affiliate Team wajib berasal dari tier yang berbeda.'; end if;
 if exists(select 1 from public.caleris_team_affiliations where status in ('pending','accepted') and (team_a_id in (v_own.id,v_target.id) or team_b_id in (v_own.id,v_target.id))) then
  raise exception 'Salah satu tim sudah memiliki affiliate atau permintaan yang masih berjalan.';
 end if;
 v_a:=least(v_own.id,v_target.id);v_b:=greatest(v_own.id,v_target.id);
 insert into public.caleris_team_affiliations(team_a_id,team_b_id,requested_by_team_id,agreement)
 values(v_a,v_b,v_own.id,coalesce(p_agreement,'{}'::jsonb)) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.member_request_team_affiliation(uuid,jsonb) from public,anon,service_role;
grant execute on function public.member_request_team_affiliation(uuid,jsonb) to authenticated;

create or replace function public.member_decide_team_affiliation(p_affiliation_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid());v_member public.members%rowtype;v_aff public.caleris_team_affiliations%rowtype;
begin
 select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
 if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Akses Team Owner/Principal diperlukan.'; end if;
 select * into v_aff from public.caleris_team_affiliations where id=p_affiliation_id for update;
 if not found or v_aff.status<>'pending' then raise exception 'Permintaan afiliasi tidak tersedia.'; end if;
 if v_member.team_id not in (v_aff.team_a_id,v_aff.team_b_id) or v_member.team_id=v_aff.requested_by_team_id then raise exception 'Hanya tim penerima yang dapat merespons permintaan ini.'; end if;
 if p_accept and exists(select 1 from public.caleris_team_affiliations other where other.id<>v_aff.id and other.status in ('pending','accepted') and (other.team_a_id in (v_aff.team_a_id,v_aff.team_b_id) or other.team_b_id in (v_aff.team_a_id,v_aff.team_b_id))) then
  raise exception 'Salah satu tim sudah memiliki affiliate lain.';
 end if;
 update public.caleris_team_affiliations set status=case when p_accept then 'accepted' else 'rejected' end,updated_at=now() where id=v_aff.id;
 return jsonb_build_object('id',v_aff.id,'status',case when p_accept then 'accepted' else 'rejected' end);
end;
$$;
revoke all on function public.member_decide_team_affiliation(uuid,boolean) from public,anon,service_role;
grant execute on function public.member_decide_team_affiliation(uuid,boolean) to authenticated;

create or replace function public.member_terminate_team_affiliation(p_affiliation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid());v_member public.members%rowtype;v_aff public.caleris_team_affiliations%rowtype;
begin
 select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
 if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Akses Team Owner/Principal diperlukan.'; end if;
 select * into v_aff from public.caleris_team_affiliations where id=p_affiliation_id for update;
 if not found or v_aff.status<>'accepted' or v_member.team_id not in (v_aff.team_a_id,v_aff.team_b_id) then raise exception 'Afiliasi aktif tidak ditemukan atau akses ditolak.'; end if;
 update public.caleris_team_affiliations set status='terminated',updated_at=now() where id=v_aff.id;
 return jsonb_build_object('id',v_aff.id,'status','terminated');
end;
$$;
revoke all on function public.member_terminate_team_affiliation(uuid) from public,anon,service_role;
grant execute on function public.member_terminate_team_affiliation(uuid) to authenticated;
