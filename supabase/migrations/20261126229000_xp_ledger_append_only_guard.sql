begin;

create or replace function private.caleris_xp_ledger_reject_mutation()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  raise exception 'XP ledger is append-only; use a new compensating ledger entry.'
    using errcode='55000';
end;
$function$;

revoke all on function private.caleris_xp_ledger_reject_mutation() from public,anon,authenticated,service_role;

drop trigger if exists caleris_xp_ledger_append_only on public.caleris_xp_ledger;
create trigger caleris_xp_ledger_append_only
before update or delete on public.caleris_xp_ledger
for each row execute function private.caleris_xp_ledger_reject_mutation();

revoke insert,update,delete on public.caleris_xp_ledger
  from public,anon,authenticated,service_role;
grant select on public.caleris_xp_ledger to authenticated,service_role;

commit;
