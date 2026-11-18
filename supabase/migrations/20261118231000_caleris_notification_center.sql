-- Persistent, character-scoped notifications for core CALERIS workflows.
create table if not exists public.caleris_notifications(
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.members(id) on delete cascade,
 actor_member_id uuid references public.members(id) on delete set null,
 category text not null,
 title text not null,
 body text not null default '',
 href text,
 metadata jsonb not null default '{}'::jsonb,
 idempotency_key text not null unique,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index if not exists caleris_notifications_member_created_idx on public.caleris_notifications(member_id,created_at desc);
create index if not exists caleris_notifications_unread_idx on public.caleris_notifications(member_id,created_at desc) where read_at is null;

alter table public.caleris_notifications enable row level security;
revoke all on public.caleris_notifications from public,anon,authenticated,service_role;
grant select on public.caleris_notifications to authenticated;
grant update(read_at) on public.caleris_notifications to authenticated;
drop policy if exists "Members read own Caleris notifications" on public.caleris_notifications;
create policy "Members read own Caleris notifications" on public.caleris_notifications
for select to authenticated using(
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_notifications.member_id)
);
drop policy if exists "Members mark own Caleris notifications read" on public.caleris_notifications;
create policy "Members mark own Caleris notifications read" on public.caleris_notifications
for update to authenticated using(
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_notifications.member_id)
) with check(
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_notifications.member_id)
);

create or replace function private.enqueue_caleris_notification(
 p_member_id uuid,p_category text,p_title text,p_body text,p_href text,p_idempotency_key text,
 p_metadata jsonb default '{}'::jsonb,p_actor_member_id uuid default null
) returns void
language plpgsql security definer set search_path=''
as $function$
begin
 if p_member_id is null or nullif(trim(p_title),'') is null or nullif(trim(p_idempotency_key),'') is null then return; end if;
 insert into public.caleris_notifications(member_id,actor_member_id,category,title,body,href,metadata,idempotency_key)
 values(p_member_id,p_actor_member_id,p_category,p_title,p_body,p_href,coalesce(p_metadata,'{}'::jsonb),p_idempotency_key)
 on conflict(idempotency_key) do nothing;
end;
$function$;
revoke all on function private.enqueue_caleris_notification(uuid,text,text,text,text,text,jsonb,uuid) from public,anon,authenticated,service_role;

create or replace function private.notify_quest_assignment()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_title text;
begin
 select q.title into v_title from public.caleris_quest_catalog q where q.id=new.quest_id;
 if tg_op='INSERT' then
  perform private.enqueue_caleris_notification(new.member_id,'quest','Quest baru tersedia',
   coalesce(v_title,'Quest baru')||' sudah ditambahkan ke daftar quest karaktermu.','/quests',
   'quest:'||new.id::text||':assigned',jsonb_build_object('assignment_id',new.id,'quest_id',new.quest_id));
 else
  if old.status is distinct from new.status and new.status='completed' then
   perform private.enqueue_caleris_notification(new.member_id,'quest','Quest selesai',
    coalesce(v_title,'Quest')||' berhasil diselesaikan.','/quests',
    'quest:'||new.id::text||':completed',jsonb_build_object('assignment_id',new.id,'quest_id',new.quest_id));
  end if;
  if old.reward_status is distinct from new.reward_status and new.reward_status='paid' then
   perform private.enqueue_caleris_notification(new.member_id,'quest','Reward quest diterima',
    'Reward untuk '||coalesce(v_title,'quest')||' sudah masuk ke wallet.','/financial-centre',
    'quest:'||new.id::text||':rewarded',jsonb_build_object('assignment_id',new.id,'transaction_id',new.reward_transaction_id));
  end if;
 end if;
 return new;
end;
$function$;

drop trigger if exists caleris_quest_notification_trigger on public.caleris_quest_assignments;
create trigger caleris_quest_notification_trigger after insert or update of status,reward_status
on public.caleris_quest_assignments for each row execute function private.notify_quest_assignment();

create or replace function private.notify_driver_development()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
 perform private.enqueue_caleris_notification(new.member_id,'development','Development berhasil',
  new.attribute_key||' meningkat dari '||new.previous_value::text||' menjadi '||new.new_value::text||'.',
  '/development','development:'||new.id::text,jsonb_build_object('history_id',new.id,'attribute_key',new.attribute_key,'ddp_spent',new.ddp_spent,'cash_eur_spent',new.cash_eur_spent));
 return new;
end;
$function$;
drop trigger if exists caleris_driver_development_notification_trigger on public.caleris_driver_development_history;
create trigger caleris_driver_development_notification_trigger after insert on public.caleris_driver_development_history
for each row execute function private.notify_driver_development();

create or replace function private.notify_contract_offer()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_driver_id uuid;v_team_id uuid;v_recipient uuid;v_title text;
begin
 select n.driver_member_id,n.team_id into v_driver_id,v_team_id
 from public.caleris_free_agent_contract_negotiations n where n.id=new.negotiation_id;
 if v_driver_id is null or v_team_id is null then return new; end if;
 v_title:=case when new.is_counter then 'Counter offer kontrak baru' else 'Tawaran kontrak baru' end;
 if new.offered_by_member_id=v_driver_id then
  for v_recipient in select m.id from public.members m where m.team_id=v_team_id and m.role='Owner' loop
   perform private.enqueue_caleris_notification(v_recipient,'contract_negotiation',v_title,
    'Driver mengirim penawaran gaji € '||new.annual_salary::text||'.','/transfer-market',
    'contract-offer:'||new.id::text||':'||v_recipient::text,
    jsonb_build_object('offer_id',new.id,'negotiation_id',new.negotiation_id,'annual_salary',new.annual_salary),new.offered_by_member_id);
  end loop;
 else
  perform private.enqueue_caleris_notification(v_driver_id,'contract_negotiation',v_title,
   'Tim mengirim penawaran gaji € '||new.annual_salary::text||'.','/transfer-market',
   'contract-offer:'||new.id::text||':'||v_driver_id::text,
   jsonb_build_object('offer_id',new.id,'negotiation_id',new.negotiation_id,'annual_salary',new.annual_salary),new.offered_by_member_id);
 end if;
 return new;
end;
$function$;
drop trigger if exists caleris_contract_offer_notification_trigger on public.caleris_free_agent_contract_offers;
create trigger caleris_contract_offer_notification_trigger after insert on public.caleris_free_agent_contract_offers
for each row execute function private.notify_contract_offer();

create or replace function private.notify_driver_move_status()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_recipient uuid;v_title text;v_body text;v_status text;
begin
 if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
 v_status:=new.status;
 v_title:=case when v_status in ('accepted','approved','loan_active') then 'Negosiasi disetujui'
  when v_status in ('rejected','declined','cancelled') then 'Negosiasi ditutup'
  else 'Pembaruan negosiasi transfer' end;
 v_body:='Status negosiasi transfer Driver diperbarui menjadi '||replace(v_status,'_',' ')||'.';
 for v_recipient in
  select distinct m.id from public.members m
  where m.id=new.driver_member_id
   or (m.role='Owner' and m.team_id in (new.buyer_team_id,new.seller_team_id))
 loop
  if v_recipient is not null then
   perform private.enqueue_caleris_notification(v_recipient,'transfer_negotiation',v_title,v_body,'/transfer-market',
    'driver-move:'||new.id::text||':'||v_status||':'||v_recipient::text,
    jsonb_build_object('negotiation_id',new.id,'move_type',new.move_type,'status',v_status),new.initiated_by);
  end if;
 end loop;
 return new;
end;
$function$;
drop trigger if exists caleris_driver_move_notification_trigger on public.caleris_driver_move_negotiations;
create trigger caleris_driver_move_notification_trigger after insert or update of status on public.caleris_driver_move_negotiations
for each row execute function private.notify_driver_move_status();

create or replace function private.notify_payroll_paid()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
 if new.status='paid' and old.status is distinct from new.status then
  perform private.enqueue_caleris_notification(new.member_id,'payroll','Gaji Race Period diterima',
   'Payroll sebesar € '||new.amount::text||' sudah masuk ke wallet karaktermu.','/financial-centre',
   'payroll:'||new.id::text||':paid',jsonb_build_object('claim_id',new.id,'period_id',new.period_id,'transaction_id',new.transaction_id));
 end if;
 return new;
end;
$function$;
drop trigger if exists caleris_payroll_notification_trigger on public.economy_payroll_claims;
create trigger caleris_payroll_notification_trigger after update of status on public.economy_payroll_claims
for each row execute function private.notify_payroll_paid();

create or replace function private.notify_race_result()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_division_name text;v_member uuid;
begin
 if new.status='closed' and old.status is distinct from new.status then
  select d.division_name into v_division_name from public.license_season_divisions d where d.id=new.season_division_id;
  for v_member in select sm.member_id from public.license_season_members sm
   where sm.season_division_id=new.season_division_id and not sm.is_hiatus
  loop
   perform private.enqueue_caleris_notification(v_member,'race_result','Hasil race resmi',
    coalesce(v_division_name,'Divisi')||' · '||new.title||' sudah dikonfirmasi FIA.','/dashboard',
    'race-result:'||new.id::text||':'||v_member::text,
    jsonb_build_object('round_id',new.id,'season_division_id',new.season_division_id));
  end loop;
 end if;
 return new;
end;
$function$;
drop trigger if exists caleris_race_result_notification_trigger on public.license_rounds;
create trigger caleris_race_result_notification_trigger after update of status on public.license_rounds
for each row execute function private.notify_race_result();

do $block$
begin
 alter publication supabase_realtime add table public.caleris_notifications;
exception when duplicate_object then null;
end
$block$;
