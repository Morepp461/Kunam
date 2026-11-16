create or replace function private.withdraw_team_applications_after_registration_rejection()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='rejected' and old.status='pending' then
    update public.caleris_team_driver_applications
    set status='withdrawn'
    where registration_id=new.id and status='pending';
  end if;
  return new;
end;
$function$;

revoke all on function private.withdraw_team_applications_after_registration_rejection() from public,anon,authenticated,service_role;

drop trigger if exists caleris_registration_rejection_withdraws_team_application on public.caleris_member_registrations;
create trigger caleris_registration_rejection_withdraws_team_application
after update of status on public.caleris_member_registrations
for each row execute function private.withdraw_team_applications_after_registration_rejection();
