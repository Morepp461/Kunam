begin;
create or replace function private.release_driver_role_after_contract_end()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from 'ended' then return new; end if;
  if exists(select 1 from public.economy_driver_contracts c where c.member_id=new.member_id and c.status='active') then return new; end if;
  update public.members set role=null,team_id=null where id=new.member_id and role='Driver';
  update public.caleris_driver_move_negotiations set status='cancelled',updated_at=now()
  where driver_member_id=new.member_id and status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved');
  return new;
end;
$$;
drop trigger if exists economy_driver_contract_release_role_insert on public.economy_driver_contracts;
create trigger economy_driver_contract_release_role_insert after insert on public.economy_driver_contracts
for each row when (new.status='ended') execute function private.release_driver_role_after_contract_end();
drop trigger if exists economy_driver_contract_release_role_update on public.economy_driver_contracts;
create trigger economy_driver_contract_release_role_update after update of status on public.economy_driver_contracts
for each row when (new.status='ended' and old.status is distinct from new.status)
execute function private.release_driver_role_after_contract_end();

create or replace function public.admin_invite_member_to_fia(p_target_member_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=(select auth.uid());
  v_member public.members%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_actor is null or not exists(select 1 from public.site_admins a where a.user_id=v_actor) then
    raise exception 'Akses administrator diperlukan.';
  end if;
  if p_target_member_id is null then raise exception 'Member tujuan tidak valid.'; end if;
  select * into v_member from public.members where id=p_target_member_id for update;
  if not found then raise exception 'Member tidak ditemukan.'; end if;
  select * into v_profile from public.profiles where member_id=v_member.id order by created_at limit 1 for update;
  if not found then raise exception 'Akun profil yang terhubung ke member tidak ditemukan.'; end if;
  if v_member.role='Owner' and v_member.team_id is not null then
    raise exception 'Team Owner harus menyelesaikan Take Over penjualan tim terlebih dahulu sebelum menjadi FIA.';
  end if;
  if exists(select 1 from public.caleris_driver_move_negotiations n where n.driver_member_id=v_member.id and n.status='loan_active') then
    raise exception 'Selesaikan atau kembalikan Driver Loan yang masih aktif sebelum mengundang member menjadi FIA.';
  end if;
  if v_member.role='Driver' then
    update public.economy_driver_contracts set status='ended',updated_by=v_actor,updated_at=now()
    where member_id=v_member.id and status='active';
  end if;
  update public.caleris_driver_move_negotiations set status='cancelled',updated_at=now()
  where driver_member_id=v_member.id and status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved');
  update public.members set role='FIA',team_id=null where id=v_member.id;
  update public.profiles set preferred_role='FIA',updated_at=now() where member_id=v_member.id;
  return jsonb_build_object('ok',true,'member_id',v_member.id,'previous_role',v_member.role,'assigned_role','FIA','released_team_id',v_member.team_id);
end;
$$;
revoke all on function public.admin_invite_member_to_fia(uuid) from public,anon,service_role;
grant execute on function public.admin_invite_member_to_fia(uuid) to authenticated;
revoke all on function private.release_driver_role_after_contract_end() from public,anon,authenticated,service_role;
commit;