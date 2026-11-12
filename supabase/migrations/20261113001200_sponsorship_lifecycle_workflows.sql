-- Sponsorship offers, counter history, target tracking, story events, and Sponsor Source payouts.
create table if not exists public.caleris_sponsorship_offer_revisions (
 id uuid primary key default gen_random_uuid(),
 offer_id uuid not null references public.caleris_sponsorship_offers(id) on delete restrict,
 actor_kind text not null check (actor_kind in ('admin','member')),
 actor_member_id uuid references public.members(id) on delete restrict,
 amount numeric(20,2) not null check (amount>=0),
 terms jsonb not null default '{}'::jsonb,
 response text not null default 'pending' check (response in ('pending','accepted','countered','rejected','superseded')),
 created_at timestamptz not null default now(),
 check ((actor_kind='admin' and actor_member_id is null) or (actor_kind='member' and actor_member_id is not null))
);
create index if not exists caleris_sponsor_offer_revision_history_idx on public.caleris_sponsorship_offer_revisions(offer_id,created_at);

create table if not exists public.caleris_sponsorship_payouts (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.caleris_sponsorship_contracts(id) on delete restrict,
 target_id uuid references public.caleris_sponsorship_targets(id) on delete restrict,
 amount numeric(20,2) not null check (amount>0),
 description text not null,
 transaction_id uuid not null unique references public.economy_transactions(id) on delete restrict,
 paid_by uuid references auth.users(id) on delete set null,
 paid_at timestamptz not null default now()
);
create index if not exists caleris_sponsor_payout_contract_idx on public.caleris_sponsorship_payouts(contract_id,paid_at desc);
alter table public.caleris_sponsorship_offer_revisions enable row level security;
alter table public.caleris_sponsorship_payouts enable row level security;
revoke all on public.caleris_sponsorship_offer_revisions,public.caleris_sponsorship_payouts from public,anon,authenticated,service_role;
grant select on public.caleris_sponsorship_offer_revisions,public.caleris_sponsorship_payouts to authenticated;

create policy "Sponsorship offer revisions visible to participants and Admin"
on public.caleris_sponsorship_offer_revisions for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.caleris_sponsorship_offers o join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=o.target_member_id where o.id=offer_id)
 or exists(select 1 from public.caleris_sponsorship_offers o join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id and m.team_id=o.target_team_id where o.id=offer_id)
);
drop policy if exists "Sponsors visible to authenticated" on public.caleris_sponsors;
create policy "Sponsors visible to active members and historical participants"
on public.caleris_sponsors for select to authenticated using (
 is_active or public.is_caleris_fia_or_admin()
 or exists(select 1 from public.caleris_sponsorship_offers o join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=o.target_member_id where o.sponsor_id=caleris_sponsors.id)
 or exists(select 1 from public.caleris_sponsorship_offers o join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id and m.team_id=o.target_team_id where o.sponsor_id=caleris_sponsors.id)
);

create policy "Sponsorship payouts visible to participants and Admin"
on public.caleris_sponsorship_payouts for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or exists(select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=c.target_member_id where c.id=contract_id)
 or exists(select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id and m.team_id=c.target_team_id where c.id=contract_id)
);

create or replace function private.create_sponsorship_contract_from_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_offer public.caleris_sponsorship_offers%rowtype;v_revision public.caleris_sponsorship_offer_revisions%rowtype;v_id uuid;
begin
 select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
 if not found then raise exception 'Sponsorship offer not found.'; end if;
 if v_offer.status not in ('offered','negotiating') then raise exception 'Sponsorship offer is no longer open.'; end if;
 select * into v_revision from public.caleris_sponsorship_offer_revisions where offer_id=p_offer_id order by created_at desc,id desc limit 1;
 if not found then raise exception 'Sponsorship offer revision is missing.'; end if;
 insert into public.caleris_sponsorship_contracts(offer_id,sponsor_id,target_kind,target_member_id,target_team_id,season_id,contract_amount,terms,status)
 values(v_offer.id,v_offer.sponsor_id,v_offer.target_kind,v_offer.target_member_id,v_offer.target_team_id,v_offer.season_id,v_revision.amount,v_revision.terms,'active')
 returning id into v_id;
 update public.caleris_sponsorship_offers set proposed_amount=v_revision.amount,terms=v_revision.terms,status='accepted' where id=v_offer.id;
 update public.caleris_sponsorship_offer_revisions set response='accepted' where id=v_revision.id;
 return v_id;
end;
$$;
revoke all on function private.create_sponsorship_contract_from_offer(uuid) from public,anon,authenticated,service_role;

create or replace function public.admin_create_sponsorship_offer(
 p_sponsor_id uuid,p_target_kind text,p_target_id uuid,p_season_id uuid,p_amount numeric,p_terms jsonb default '{}'::jsonb,p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_offer_id uuid;v_role text;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat membuat sponsorship offer.'; end if;
 if p_amount is null or p_amount<0 or p_amount<>round(p_amount,2) then raise exception 'Nominal offer tidak valid.'; end if;
 if not exists(select 1 from public.caleris_sponsors where id=p_sponsor_id and is_active) then raise exception 'Sponsor tidak tersedia atau nonaktif.'; end if;
 if not exists(select 1 from public.license_seasons where id=p_season_id) then raise exception 'Season tidak ditemukan.'; end if;
 if p_target_kind='driver' then
  select role into v_role from public.members where id=p_target_id;
  if v_role is distinct from 'Driver' then raise exception 'Target sponsorship Driver harus role Driver.'; end if;
 elsif p_target_kind='team' then
  if not exists(select 1 from public.teams where id=p_target_id) then raise exception 'Tim target tidak ditemukan.'; end if;
 else raise exception 'Jenis target sponsorship tidak valid.'; end if;
 insert into public.caleris_sponsorship_offers(sponsor_id,target_kind,target_member_id,target_team_id,season_id,proposed_amount,terms,status,expires_at,created_by)
 values(p_sponsor_id,p_target_kind,case when p_target_kind='driver' then p_target_id end,case when p_target_kind='team' then p_target_id end,p_season_id,p_amount,coalesce(p_terms,'{}'::jsonb),'offered',p_expires_at,(select auth.uid()))
 returning id into v_offer_id;
 insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
 values(v_offer_id,'admin',p_amount,coalesce(p_terms,'{}'::jsonb));
 return v_offer_id;
end;
$$;
revoke all on function public.admin_create_sponsorship_offer(uuid,text,uuid,uuid,numeric,jsonb,timestamptz) from public,anon,service_role;
grant execute on function public.admin_create_sponsorship_offer(uuid,text,uuid,uuid,numeric,jsonb,timestamptz) to authenticated;

create or replace function public.member_respond_sponsorship_offer(p_offer_id uuid,p_action text,p_counter_amount numeric default null,p_terms jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.members%rowtype;v_offer public.caleris_sponsorship_offers%rowtype;v_last public.caleris_sponsorship_offer_revisions%rowtype;v_contract_id uuid;
begin
 select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
 if not found then raise exception 'Member profile is not linked.'; end if;
 select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
 if not found or v_offer.status not in ('offered','negotiating') then raise exception 'Sponsorship offer is not open.'; end if;
 if v_offer.expires_at is not null and now()>v_offer.expires_at then update public.caleris_sponsorship_offers set status='expired' where id=v_offer.id;return jsonb_build_object('status','expired');end if;
 if not ((v_offer.target_kind='driver' and v_offer.target_member_id=v_member.id)
   or (v_offer.target_kind='team' and v_offer.target_team_id=v_member.team_id and v_member.role in ('Owner','Principal'))) then
  raise exception 'Akun ini bukan pihak penerima sponsorship offer.';
 end if;
 select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
 if v_last.actor_kind<>'admin' then raise exception 'Sponsorship offer menunggu respons Admin.'; end if;
 if p_action='reject' then
  update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
  update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
  return jsonb_build_object('status','rejected');
 elsif p_action='accept' then
  v_contract_id:=private.create_sponsorship_contract_from_offer(v_offer.id);
  return jsonb_build_object('status','accepted','contract_id',v_contract_id);
 elsif p_action='counter' then
  if p_counter_amount is null or p_counter_amount<0 or p_counter_amount<>round(p_counter_amount,2) then raise exception 'Counter sponsorship amount is invalid.'; end if;
  update public.caleris_sponsorship_offer_revisions set response='countered' where id=v_last.id;
  insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,actor_member_id,amount,terms)
  values(v_offer.id,'member',v_member.id,p_counter_amount,coalesce(p_terms,'{}'::jsonb));
  update public.caleris_sponsorship_offers set status='negotiating' where id=v_offer.id;
  return jsonb_build_object('status','negotiating');
 else raise exception 'Action tidak dikenal.'; end if;
end;
$$;
revoke all on function public.member_respond_sponsorship_offer(uuid,text,numeric,jsonb) from public,anon,service_role;
grant execute on function public.member_respond_sponsorship_offer(uuid,text,numeric,jsonb) to authenticated;

create or replace function public.admin_respond_sponsorship_offer(p_offer_id uuid,p_action text,p_amount numeric default null,p_terms jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_offer public.caleris_sponsorship_offers%rowtype;v_last public.caleris_sponsorship_offer_revisions%rowtype;v_contract_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat merespons negosiasi sponsor.'; end if;
 select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
 if not found or v_offer.status<>'negotiating' then raise exception 'Tidak ada counter sponsorship yang menunggu.'; end if;
 if v_offer.expires_at is not null and now()>v_offer.expires_at then update public.caleris_sponsorship_offers set status='expired' where id=v_offer.id;return jsonb_build_object('status','expired');end if;
 select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
 if v_last.actor_kind<>'member' then raise exception 'Negosiasi belum menunggu respons member.'; end if;
 if p_action='reject' then
  update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
  update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
  return jsonb_build_object('status','rejected');
 elsif p_action='accept' then
  v_contract_id:=private.create_sponsorship_contract_from_offer(v_offer.id);
  return jsonb_build_object('status','accepted','contract_id',v_contract_id);
 elsif p_action='counter' then
  if p_amount is null or p_amount<0 or p_amount<>round(p_amount,2) then raise exception 'Nominal counter tidak valid.'; end if;
  update public.caleris_sponsorship_offer_revisions set response='countered' where id=v_last.id;
  insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
  values(v_offer.id,'admin',p_amount,coalesce(p_terms,'{}'::jsonb));
  return jsonb_build_object('status','negotiating');
 else raise exception 'Action tidak dikenal.'; end if;
end;
$$;
revoke all on function public.admin_respond_sponsorship_offer(uuid,text,numeric,jsonb) from public,anon,service_role;
grant execute on function public.admin_respond_sponsorship_offer(uuid,text,numeric,jsonb) to authenticated;

create or replace function public.admin_create_sponsorship_target(
 p_contract_id uuid,p_title text,p_description text,p_metric_key text,p_target_value numeric,p_bonus_amount numeric,p_due_at timestamptz default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat mengatur target sponsor.'; end if;
 if p_target_value is null or p_target_value<=0 or p_bonus_amount is null or p_bonus_amount<0 then raise exception 'Nilai target atau bonus tidak valid.'; end if;
 if not exists(select 1 from public.caleris_sponsorship_contracts where id=p_contract_id and status='active') then raise exception 'Kontrak sponsor tidak aktif.'; end if;
 insert into public.caleris_sponsorship_targets(contract_id,title,description,metric_key,target_value,bonus_amount,due_at)
 values(p_contract_id,trim(p_title),nullif(trim(p_description),''),trim(p_metric_key),p_target_value,p_bonus_amount,p_due_at)
 returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.admin_create_sponsorship_target(uuid,text,text,text,numeric,numeric,timestamptz) from public,anon,service_role;
grant execute on function public.admin_create_sponsorship_target(uuid,text,text,text,numeric,numeric,timestamptz) to authenticated;

create or replace function public.admin_record_sponsorship_progress(p_target_id uuid,p_new_value numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_target public.caleris_sponsorship_targets%rowtype;v_delta numeric;v_status text;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat mencatat progres sponsor.'; end if;
 if p_new_value is null or p_new_value<0 then raise exception 'Nilai progres tidak valid.'; end if;
 select * into v_target from public.caleris_sponsorship_targets where id=p_target_id for update;
 if not found or v_target.status in ('missed','cancelled') then raise exception 'Target tidak tersedia untuk diperbarui.'; end if;
 v_delta:=p_new_value-v_target.current_value;
 if v_delta=0 then raise exception 'Tidak ada perubahan progres.'; end if;
 v_status:=case when p_new_value>=v_target.target_value then 'achieved' else 'in_progress' end;
 insert into public.caleris_sponsorship_progress(target_id,value_delta,note,recorded_by)
 values(v_target.id,v_delta,nullif(trim(p_note),''),(select auth.uid()));
 update public.caleris_sponsorship_targets set current_value=p_new_value,status=v_status where id=v_target.id;
 return jsonb_build_object('target_id',v_target.id,'current_value',p_new_value,'status',v_status,'delta',v_delta);
end;
$$;
revoke all on function public.admin_record_sponsorship_progress(uuid,numeric,text) from public,anon,service_role;
grant execute on function public.admin_record_sponsorship_progress(uuid,numeric,text) to authenticated;

create or replace function public.admin_create_sponsorship_story_event(p_contract_id uuid,p_event_type text,p_headline text,p_body text,p_visibility text default 'participants')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat menerbitkan storyline sponsor.'; end if;
 if p_visibility not in ('participants','public','admin') then raise exception 'Visibility tidak valid.'; end if;
 insert into public.caleris_sponsorship_story_events(contract_id,event_type,headline,body,visibility,created_by)
 values(p_contract_id,trim(p_event_type),trim(p_headline),trim(p_body),p_visibility,(select auth.uid())) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.admin_create_sponsorship_story_event(uuid,text,text,text,text) from public,anon,service_role;
grant execute on function public.admin_create_sponsorship_story_event(uuid,text,text,text,text) to authenticated;

create or replace function public.admin_pay_sponsorship_contract(p_contract_id uuid,p_amount numeric,p_description text,p_target_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_contract public.caleris_sponsorship_contracts%rowtype;v_sponsor public.caleris_sponsors%rowtype;
 v_source uuid;v_destination uuid;v_result jsonb;v_payout_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat membayar sponsorship.'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal payout tidak valid.'; end if;
 select * into v_contract from public.caleris_sponsorship_contracts where id=p_contract_id and status='active' for update;
 if not found then raise exception 'Kontrak sponsorship tidak aktif.'; end if;
 select * into v_sponsor from public.caleris_sponsors where id=v_contract.sponsor_id for update;
 if v_sponsor.available_budget is null or v_sponsor.available_budget<p_amount then raise exception 'Budget sponsor tidak mencukupi atau belum diatur.'; end if;
 if p_target_id is not null and not exists(select 1 from public.caleris_sponsorship_targets where id=p_target_id and contract_id=v_contract.id and status='achieved') then raise exception 'Bonus hanya dapat dibayar untuk target yang sudah tercapai.'; end if;
 if v_contract.target_kind='driver' then
  select id into v_destination from public.economy_wallet_accounts where account_kind='driver' and member_id=v_contract.target_member_id and is_active;
 else
  select id into v_destination from public.economy_wallet_accounts where account_kind='team' and team_id=v_contract.target_team_id and is_active;
 end if;
 select id into v_source from public.economy_wallet_accounts where account_kind='sponsor_source' and is_active;
 if v_source is null or v_destination is null then raise exception 'Sponsor Source atau wallet penerima tidak tersedia.'; end if;
 v_result:=private.post_economy_transaction(v_source,v_destination,p_amount,'sponsor_payout',
  trim(p_description),'sponsor-payout:'||p_contract_id::text||':'||gen_random_uuid()::text,
  (select auth.uid()),jsonb_build_object('contract_id',p_contract_id,'target_id',p_target_id,'sponsor_id',v_sponsor.id),null,false);
 update public.caleris_sponsors set available_budget=available_budget-p_amount,updated_at=now() where id=v_sponsor.id;
 insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
 values(v_contract.id,p_target_id,p_amount,trim(p_description),(v_result->>'transaction_id')::uuid,(select auth.uid()))
 returning id into v_payout_id;
 return jsonb_build_object('payout_id',v_payout_id,'transaction_id',v_result->>'transaction_id');
end;
$$;
revoke all on function public.admin_pay_sponsorship_contract(uuid,numeric,text,uuid) from public,anon,service_role;
grant execute on function public.admin_pay_sponsorship_contract(uuid,numeric,text,uuid) to authenticated;
