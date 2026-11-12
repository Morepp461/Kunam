-- A driver can only be marked on hiatus after their season has ended.
create or replace function public.guard_license_offseason_hiatus()
returns trigger language plpgsql set search_path='' as $$
declare v_status text;
begin
 if new.is_hiatus and not old.is_hiatus then
  select s.status into v_status
  from public.license_seasons s
  where s.id=new.season_id;
  if v_status is distinct from 'completed' then
   raise exception 'Status hiatus hanya dapat diaktifkan pada off-season setelah season selesai.';
  end if;
  select m.license into new.preserved_license
  from public.members m where m.id=new.member_id;
 end if;
 return new;
end;
$$;
drop trigger if exists license_offseason_hiatus_guard on public.license_season_members;
create trigger license_offseason_hiatus_guard
before update of is_hiatus on public.license_season_members
for each row execute function public.guard_license_offseason_hiatus();
revoke all on function public.guard_license_offseason_hiatus() from public,anon,authenticated,service_role;
