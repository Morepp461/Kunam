begin;

create or replace function public.caleris_member_team_activity()
returns trigger
language plpgsql security definer set search_path=public
as $member_team_activity$
declare old_team_name text; new_team_name text;
begin
  if old.team_id is distinct from new.team_id
    and (old.role='Driver' or new.role='Driver') then
    select name into old_team_name from public.teams where id=old.team_id;
    select name into new_team_name from public.teams where id=new.team_id;
    perform public.caleris_log_activity(
      new.id,new.team_id,'team_transfer','Perpindahan tim',
      coalesce(new.character_name,'Driver')||' berpindah dari '||
        coalesce(old_team_name,'Independent')||' ke '||coalesce(new_team_name,'Independent')||'.',
      jsonb_build_object('source_id','member-team:'||new.id::text||':'||gen_random_uuid()::text,
        'previous_team_id',old.team_id,'new_team_id',new.team_id)
    );
  end if;
  return new;
end;
$member_team_activity$;

create or replace function public.caleris_driver_contract_activity()
returns trigger
language plpgsql security definer set search_path=public
as $driver_contract_activity$
declare member_name text; team_name text;
begin
  if new.status='active' and (tg_op='INSERT' or old.status is distinct from new.status) then
    select character_name into member_name from public.members where id=new.member_id;
    select name into team_name from public.teams where id=new.team_id;
    perform public.caleris_log_activity(
      new.member_id,new.team_id,'contract_status','Kontrak driver aktif',
      coalesce(member_name,'Driver')||' resmi terikat dengan '||coalesce(team_name,'tim')||'.',
      jsonb_build_object('source_id','driver-contract:'||new.id::text||':'||gen_random_uuid()::text,
        'contract_id',new.id,'status',new.status)
    );
  elsif tg_op='UPDATE' and old.status is distinct from new.status then
    select character_name into member_name from public.members where id=new.member_id;
    select name into team_name from public.teams where id=new.team_id;
    perform public.caleris_log_activity(
      new.member_id,new.team_id,'contract_status','Status kontrak diperbarui',
      coalesce(member_name,'Driver')||' · '||coalesce(team_name,'tim')||' · '||new.status||'.',
      jsonb_build_object('source_id','driver-contract:'||new.id::text||':'||gen_random_uuid()::text,
        'contract_id',new.id,'status',new.status)
    );
  end if;
  return new;
end;
$driver_contract_activity$;

create or replace function public.caleris_sponsorship_activity()
returns trigger
language plpgsql security definer set search_path=public
as $sponsorship_activity$
declare sponsor_name text; target_name text; target_team uuid; target_member uuid;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  select name into sponsor_name from public.caleris_sponsors where id=new.sponsor_id;
  target_team:=new.target_team_id;
  target_member:=new.target_member_id;
  if new.target_kind='team' then
    select name into target_name from public.teams where id=target_team;
  else
    select character_name into target_name from public.members where id=target_member;
  end if;
  perform public.caleris_log_activity(
    target_member,target_team,'sponsorship_status',
    case when new.status='active' then 'Kerja sama sponsor aktif' else 'Status kerja sama sponsor diperbarui' end,
    coalesce(sponsor_name,'Sponsor')||' · '||coalesce(target_name,'Target tidak tersedia')||' · '||new.status||'.',
    jsonb_build_object('source_id','sponsorship:'||new.id::text||':'||gen_random_uuid()::text,
      'contract_id',new.id,'status',new.status,'target_kind',new.target_kind)
  );
  return new;
end;
$sponsorship_activity$;

create or replace function public.caleris_payroll_activity()
returns trigger
language plpgsql security definer set search_path=public
as $payroll_activity$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.caleris_log_activity(
      null,null,'payroll_processed','Payroll otomatis diproses',
      coalesce(new.payroll_paid,0)::text||' pembayaran selesai; '||
        coalesce(new.payroll_pending,0)::text||' masih menunggu.',
      jsonb_build_object('source_id','payroll-run:'||new.id::text,'run_id',new.id)
    );
  end if;
  return new;
end;
$payroll_activity$;

create or replace function public.caleris_merchandise_activity()
returns trigger
language plpgsql security definer set search_path=public
as $merchandise_activity$
declare team_name text;
begin
  if coalesce(new.units_sold,0)>0 then
    select name into team_name from public.teams where id=new.team_id;
    perform public.caleris_log_activity(
      null,new.team_id,'merchandise_sales','Penjualan merchandise',
      coalesce(team_name,'Tim')||' mencatat '||new.units_sold::text||' unit merchandise terjual.',
      jsonb_build_object('source_id','merchandise-run:'||new.id::text,'run_id',new.id,'units_sold',new.units_sold)
    );
  end if;
  return new;
end;
$merchandise_activity$;

drop trigger if exists caleris_community_member_team_activity on public.members;
create trigger caleris_community_member_team_activity
after update of team_id on public.members
for each row execute function public.caleris_member_team_activity();

drop trigger if exists caleris_community_driver_contract_activity on public.economy_driver_contracts;
create trigger caleris_community_driver_contract_activity
after insert or update of status on public.economy_driver_contracts
for each row execute function public.caleris_driver_contract_activity();

drop trigger if exists caleris_community_sponsorship_activity on public.caleris_sponsorship_contracts;
create trigger caleris_community_sponsorship_activity
after insert or update of status on public.caleris_sponsorship_contracts
for each row execute function public.caleris_sponsorship_activity();

drop trigger if exists caleris_community_payroll_activity on public.caleris_payroll_automation_runs;
create trigger caleris_community_payroll_activity
after insert or update of status on public.caleris_payroll_automation_runs
for each row execute function public.caleris_payroll_activity();

drop trigger if exists caleris_community_merchandise_activity on public.caleris_merchandise_sales_runs;
create trigger caleris_community_merchandise_activity
after insert on public.caleris_merchandise_sales_runs
for each row execute function public.caleris_merchandise_activity();

revoke all on function public.caleris_member_team_activity() from public,anon,authenticated;
revoke all on function public.caleris_driver_contract_activity() from public,anon,authenticated;
revoke all on function public.caleris_sponsorship_activity() from public,anon,authenticated;
revoke all on function public.caleris_payroll_activity() from public,anon,authenticated;
revoke all on function public.caleris_merchandise_activity() from public,anon,authenticated;

commit;
