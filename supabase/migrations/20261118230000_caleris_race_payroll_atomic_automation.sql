-- Atomic CALERIS season setup, explicit race lifecycle and automatic payroll recovery.
-- Existing race confirmation remains authoritative and check-in still closes at 23:59:59.
create or replace function public.fia_create_caleris_season_atomic(p_start_date date,p_schedule jsonb,p_race_schedules jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_created jsonb;v_season_id uuid;v_item jsonb;v_division_key text;v_round_number integer;
 v_race_time time;v_duration integer;v_round record;v_expected integer;v_updated integer:=0;v_seen uuid[]:=array[]::uuid[];
begin
 if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then raise exception 'Hanya Admin atau FIA yang dapat membuat season CALERIS MASTERS.'; end if;
 if jsonb_typeof(p_race_schedules) is distinct from 'array' then raise exception 'Jadwal waktu race wajib berupa daftar.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('caleris-masters-season-creation',0));
 v_created:=public.fia_create_caleris_season(p_start_date,p_schedule);
 v_season_id:=(v_created->>'season_id')::uuid;
 select count(*) into v_expected from public.license_rounds r join public.license_season_divisions d on d.id=r.season_division_id where d.season_id=v_season_id;
 if jsonb_array_length(p_race_schedules)<>v_expected then raise exception 'Jumlah jadwal waktu (%) tidak sama dengan jumlah round (%).',jsonb_array_length(p_race_schedules),v_expected; end if;
 for v_item in select value from jsonb_array_elements(p_race_schedules) loop
  v_division_key:=lower(coalesce(v_item->>'division_key',''));
  v_round_number:=nullif(v_item->>'round_number','')::integer;
  v_race_time:=coalesce(nullif(v_item->>'race_time','')::time,time '19:00');
  v_duration:=coalesce(nullif(v_item->>'duration_minutes','')::integer,90);
  if v_division_key not in ('premio','zwei') or v_round_number is null or v_round_number<1 then raise exception 'Identitas divisi atau nomor round pada jadwal tidak valid.'; end if;
  if v_duration not between 1 and 600 then raise exception 'Durasi race harus 1 sampai 600 menit.'; end if;
  select r.id,r.checkin_opens_at into v_round from public.license_rounds r join public.license_season_divisions d on d.id=r.season_division_id
   where d.season_id=v_season_id and lower(d.division_key)=v_division_key and r.round_number=v_round_number for update of r;
  if not found then raise exception 'Round % untuk divisi % tidak ditemukan.',v_round_number,v_division_key; end if;
  if v_round.id=any(v_seen) then raise exception 'Jadwal round duplikat ditemukan.'; end if;
  v_seen:=array_append(v_seen,v_round.id);
  update public.license_rounds set race_starts_at=(((v_round.checkin_opens_at at time zone 'Asia/Jakarta')::date+v_race_time) at time zone 'Asia/Jakarta'),race_duration_minutes=v_duration where id=v_round.id;
  v_updated:=v_updated+1;
 end loop;
 if v_updated<>v_expected then raise exception 'Tidak seluruh jadwal race berhasil dipasang.'; end if;
 return v_created||jsonb_build_object('race_schedules_updated',v_updated,'schedule_atomic',true);
end;
$function$;
revoke all on function public.fia_create_caleris_season_atomic(date,jsonb,jsonb) from public,anon;
grant execute on function public.fia_create_caleris_season_atomic(date,jsonb,jsonb) to authenticated;

alter table public.license_rounds add column if not exists race_lifecycle_status text not null default 'upcoming';
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.license_rounds'::regclass and conname='license_rounds_race_lifecycle_status_check') then
  alter table public.license_rounds add constraint license_rounds_race_lifecycle_status_check check(race_lifecycle_status in ('upcoming','in_progress','awaiting_result','result_confirmed','completed'));
 end if;
end $$;

create table if not exists public.caleris_race_lifecycle_runs(
 id uuid primary key default gen_random_uuid(),started_at timestamptz not null default now(),finished_at timestamptz,
 status text not null default 'running' check(status in ('running','completed','failed')),rounds_updated integer not null default 0,error text
);
alter table public.caleris_race_lifecycle_runs enable row level security;
revoke all on public.caleris_race_lifecycle_runs from public,anon,authenticated,service_role;
grant select on public.caleris_race_lifecycle_runs to authenticated;
drop policy if exists "Admins read race lifecycle runs" on public.caleris_race_lifecycle_runs;
create policy "Admins read race lifecycle runs" on public.caleris_race_lifecycle_runs for select to authenticated
 using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.process_race_lifecycle()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_run_id uuid;v_updated integer:=0;v_error text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('caleris-race-lifecycle',0)) then return jsonb_build_object('status','already_running','updated',0); end if;
 insert into public.caleris_race_lifecycle_runs default values returning id into v_run_id;
 with changed as(
  update public.license_rounds r set race_lifecycle_status=case
   when r.status='closed' and now()>=r.race_starts_at+make_interval(mins=>r.race_duration_minutes) then 'completed'
   when r.status='closed' then 'result_confirmed'
   when now()<r.race_starts_at then 'upcoming'
   when now()<r.race_starts_at+make_interval(mins=>r.race_duration_minutes) then 'in_progress'
   else 'awaiting_result' end
  where r.status in ('scheduled','open','closed')
   and r.race_lifecycle_status is distinct from case
    when r.status='closed' and now()>=r.race_starts_at+make_interval(mins=>r.race_duration_minutes) then 'completed'
    when r.status='closed' then 'result_confirmed'
    when now()<r.race_starts_at then 'upcoming'
    when now()<r.race_starts_at+make_interval(mins=>r.race_duration_minutes) then 'in_progress'
    else 'awaiting_result' end returning 1
 ) select count(*) into v_updated from changed;
 update public.caleris_race_lifecycle_runs set finished_at=now(),status='completed',rounds_updated=v_updated where id=v_run_id;
 return jsonb_build_object('status','completed','run_id',v_run_id,'rounds_updated',v_updated);
exception when others then
 get stacked diagnostics v_error=message_text;
 if v_run_id is not null then update public.caleris_race_lifecycle_runs set finished_at=now(),status='failed',error=left(v_error,1000) where id=v_run_id; end if;
 raise;
end;
$function$;
revoke all on function private.process_race_lifecycle() from public,anon,authenticated,service_role;

create table if not exists public.caleris_payroll_automation_runs(
 id uuid primary key default gen_random_uuid(),started_at timestamptz not null default now(),finished_at timestamptz,
 status text not null default 'running' check(status in ('running','completed','partial','failed')),
 payroll_paid integer not null default 0,payroll_pending integer not null default 0,error text
);
alter table public.caleris_payroll_automation_runs enable row level security;
revoke all on public.caleris_payroll_automation_runs from public,anon,authenticated,service_role;
grant select on public.caleris_payroll_automation_runs to authenticated;
drop policy if exists "Admins read payroll automation runs" on public.caleris_payroll_automation_runs;
create policy "Admins read payroll automation runs" on public.caleris_payroll_automation_runs for select to authenticated
 using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.retry_pending_economy_payroll()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_run_id uuid;v_actor_id uuid;v_result jsonb;v_paid integer:=0;v_pending integer:=0;v_error text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('caleris-pending-payroll-retry',0)) then return jsonb_build_object('status','already_running','paid',0,'pending',0); end if;
 insert into public.caleris_payroll_automation_runs default values returning id into v_run_id;
 select user_id into v_actor_id from public.site_admins order by user_id limit 1;
 if v_actor_id is null then raise exception 'Tidak ada Admin terdaftar untuk pemrosesan payroll otomatis.'; end if;
 -- Claims are created only after the final round in a Race Period. This worker retries immutable claims only.
 v_result:=public.admin_process_pending_economy_payroll(v_actor_id);
 v_paid:=coalesce((v_result->>'paid')::integer,0);v_pending:=coalesce((v_result->>'pending')::integer,0);
 update public.caleris_payroll_automation_runs set finished_at=now(),status=case when v_pending=0 then 'completed' else 'partial' end,
  payroll_paid=v_paid,payroll_pending=v_pending where id=v_run_id;
 return jsonb_build_object('status',case when v_pending=0 then 'completed' else 'partial' end,'run_id',v_run_id,'paid',v_paid,'pending',v_pending);
exception when others then
 get stacked diagnostics v_error=message_text;
 if v_run_id is not null then update public.caleris_payroll_automation_runs set finished_at=now(),status='failed',error=left(v_error,1000) where id=v_run_id; end if;
 raise;
end;
$function$;
revoke all on function private.retry_pending_economy_payroll() from public,anon,authenticated,service_role;

do $$ begin
 if exists(select 1 from cron.job where jobname='caleris-race-lifecycle') then perform cron.unschedule('caleris-race-lifecycle'); end if;
 perform cron.schedule('caleris-race-lifecycle','* * * * *','select private.process_race_lifecycle();');
 if exists(select 1 from cron.job where jobname='caleris-payroll-pending-retry') then perform cron.unschedule('caleris-payroll-pending-retry'); end if;
 perform cron.schedule('caleris-payroll-pending-retry','*/5 * * * *','select private.retry_pending_economy_payroll();');
end $$;
