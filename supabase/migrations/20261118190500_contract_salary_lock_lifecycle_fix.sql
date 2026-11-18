create or replace function private.guard_driver_contract()
returns trigger language plpgsql set search_path=''
as $$
declare
 v_driver public.members%rowtype;
 v_band public.caleris_driver_salary_bands%rowtype;
begin
 if tg_op='DELETE' then
  raise exception 'Kontrak Driver tidak dapat dihapus. Akhiri kontrak melalui alur lifecycle.';
 end if;
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.season_id is distinct from old.season_id
    or new.team_id is distinct from old.team_id or new.member_id is distinct from old.member_id
    or new.annual_salary is distinct from old.annual_salary then
   raise exception 'Identitas, tim, season, dan nominal gaji kontrak terkunci setelah disepakati.';
  end if;
 else
  select * into v_driver from public.members where id=new.member_id;
  if not found or v_driver.role<>'Driver' then
   raise exception 'Kontrak hanya berlaku untuk karakter Driver.';
  end if;
  select * into v_band from public.caleris_driver_salary_bands
   where lower(license_label)=lower(trim(coalesce(v_driver.license,'')));
  if not found then raise exception 'Lisensi Driver belum memiliki rentang gaji resmi.'; end if;
  if new.annual_salary<v_band.salary_min_eur or new.annual_salary>v_band.salary_max_eur
    or new.annual_salary<>round(new.annual_salary,2) then
   raise exception 'Gaji tahunan harus berada pada rentang €% sampai €%.',v_band.salary_min_eur,v_band.salary_max_eur;
  end if;
 end if;
 if new.status in ('active','suspended') then
  select * into v_driver from public.members where id=new.member_id;
  if v_driver.team_id is distinct from new.team_id then
   raise exception 'Kontrak aktif hanya dapat dimiliki Driver yang sudah terdaftar pada tim tersebut.';
  end if;
 end if;
 if new.status='pending_registration' then
  select * into v_driver from public.members where id=new.member_id;
  if v_driver.team_id is not null and v_driver.team_id is distinct from new.team_id then
   raise exception 'Driver sudah terikat dengan tim lain.';
  end if;
 end if;
 return new;
end;
$$;