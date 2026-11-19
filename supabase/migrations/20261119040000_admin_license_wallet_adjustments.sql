begin;

create table if not exists public.caleris_admin_license_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  previous_license text,
  new_license text not null references public.caleris_driver_salary_bands(license_label) on update cascade on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 240),
  created_at timestamptz not null default now()
);
create index if not exists caleris_admin_license_assignments_member_idx
  on public.caleris_admin_license_assignments(member_id,created_at desc);
alter table public.caleris_admin_license_assignments enable row level security;
revoke all on public.caleris_admin_license_assignments from public,anon,authenticated,service_role;
grant select on public.caleris_admin_license_assignments to authenticated;
drop policy if exists "Site admins read manual license assignment audit" on public.caleris_admin_license_assignments;
create policy "Site admins read manual license assignment audit"
 on public.caleris_admin_license_assignments for select to authenticated
 using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.default_new_driver_license()
returns trigger language plpgsql set search_path=''
as $function$
begin
 if new.role='Driver' and nullif(trim(new.license),'') is null then
   new.license:='Bronze';
 end if;
 return new;
end;
$function$;
drop trigger if exists members_default_driver_license on public.members;
create trigger members_default_driver_license
 before insert on public.members
 for each row execute function private.default_new_driver_license();

create or replace function public.admin_assign_driver_license(
 p_member_id uuid,
 p_license_label text,
 p_reason text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_member public.members%rowtype;
 v_band public.caleris_driver_salary_bands%rowtype;
 v_old text;
 v_actor uuid:=(select auth.uid());
begin
 if v_actor is null or not exists(select 1 from public.site_admins a where a.user_id=v_actor) then
   raise exception 'Hanya Site Admin yang dapat menetapkan lisensi Driver.';
 end if;
 if p_member_id is null or p_license_label is null or length(trim(p_license_label))=0 then
   raise exception 'Driver dan lisensi wajib dipilih.';
 end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 240 then
   raise exception 'Alasan wajib diisi (3–240 karakter).';
 end if;
 select * into v_band from public.caleris_driver_salary_bands
  where license_label=p_license_label;
 if not found then raise exception 'Pilihan lisensi tidak terdaftar.'; end if;
 select * into v_member from public.members where id=p_member_id and role='Driver' for update;
 if not found then raise exception 'Driver tidak ditemukan atau bukan role Driver.'; end if;
 v_old:=v_member.license;
 update public.members set license=v_band.license_label where id=v_member.id;
 insert into public.caleris_admin_license_assignments(member_id,previous_license,new_license,assigned_by,reason)
 values(v_member.id,v_old,v_band.license_label,v_actor,trim(p_reason));
 return jsonb_build_object('member_id',v_member.id,'previous_license',v_old,'new_license',v_band.license_label);
end;
$function$;
revoke all on function public.admin_assign_driver_license(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_assign_driver_license(uuid,text,text) to authenticated;

create or replace function public.admin_inject_wallet_balance(
 p_wallet_account_id uuid,
 p_amount numeric,
 p_reason text,
 p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_actor uuid:=(select auth.uid());
 v_target public.economy_wallet_accounts%rowtype;
 v_bank_id uuid;
 v_sponsor_id uuid;
 v_funding jsonb;
 v_credit jsonb;
 v_bank public.economy_wallet_accounts%rowtype;
 v_fund_amount numeric(20,2);
begin
 if v_actor is null or not exists(select 1 from public.site_admins a where a.user_id=v_actor) then
   raise exception 'Hanya Site Admin yang dapat melakukan wallet injection.';
 end if;
 if p_wallet_account_id is null or p_amount is null or p_amount<=0
   or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then
   raise exception 'Wallet tujuan atau nominal tidak valid.';
 end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 240 then
   raise exception 'Catatan wajib diisi (3–240 karakter).';
 end if;
 if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then
   raise exception 'Idempotency key tidak valid.';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
 select * into v_target from public.economy_wallet_accounts
  where id=p_wallet_account_id and is_active
  for update;
 if not found or v_target.account_kind not in ('driver','team_owner','team') then
   raise exception 'Wallet tujuan harus Driver, Owner, atau Tim yang aktif.';
 end if;
 select id into v_bank_id from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active for update;
 select id into v_sponsor_id from public.economy_wallet_accounts
  where account_kind='sponsor_source' and is_active for update;
 if v_bank_id is null or v_sponsor_id is null then
   raise exception 'Wallet VreeoBank atau sumber pendanaan sistem tidak tersedia.';
 end if;
 select * into v_bank from public.economy_wallet_accounts where id=v_bank_id;
 v_fund_amount:=greatest(p_amount-v_bank.balance,0);
 if v_fund_amount>0 then
   v_funding:=private.post_economy_transaction(
    v_sponsor_id,v_bank_id,v_fund_amount,'bank_funding',
    'VreeoBank unlimited funding · Admin wallet injection',
    left(trim(p_idempotency_key)||':fund',180),v_actor,
    jsonb_build_object('purpose','admin_wallet_injection','target_wallet_id',p_wallet_account_id,'reason',trim(p_reason)),null,false
   );
 end if;
 v_credit:=private.post_economy_transaction(
   v_bank_id,p_wallet_account_id,p_amount,'admin_adjustment',
   'Admin wallet injection · '||trim(p_reason),
   left(trim(p_idempotency_key)||':credit',180),v_actor,
   jsonb_build_object('purpose','admin_wallet_injection','reason',trim(p_reason),'wallet_kind',v_target.account_kind,'member_id',v_target.member_id,'team_id',v_target.team_id),null,false
 );
 return jsonb_build_object('status',coalesce(v_credit->>'status','posted'),
   'transaction_id',v_credit->>'transaction_id','funding_transaction_id',v_funding->>'transaction_id',
   'wallet_id',p_wallet_account_id,'amount',p_amount);
end;
$function$;
revoke all on function public.admin_inject_wallet_balance(uuid,numeric,text,text) from public,anon,authenticated;
grant execute on function public.admin_inject_wallet_balance(uuid,numeric,text,text) to authenticated;

commit;