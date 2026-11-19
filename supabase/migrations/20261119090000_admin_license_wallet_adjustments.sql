begin;

create table if not exists public.caleris_admin_license_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  previous_license text,
  new_license text not null,
  reason text not null check (length(trim(reason)) between 3 and 240),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.caleris_admin_license_assignments enable row level security;
revoke all on public.caleris_admin_license_assignments from public, anon, authenticated;
grant select on public.caleris_admin_license_assignments to authenticated;
create policy "Site admins read license assignment audit"
on public.caleris_admin_license_assignments for select to authenticated
using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create table if not exists public.caleris_admin_wallet_injections (
  id uuid primary key default gen_random_uuid(),
  wallet_account_id uuid not null references public.economy_wallet_accounts(id) on delete restrict,
  amount numeric(20,2) not null check (amount > 0),
  bank_funding_transaction_id uuid not null references public.economy_transactions(id) on delete restrict,
  credit_transaction_id uuid not null unique references public.economy_transactions(id) on delete restrict,
  idempotency_key text not null unique check (length(trim(idempotency_key)) between 8 and 180),
  reason text not null check (length(trim(reason)) between 3 and 240),
  injected_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.caleris_admin_wallet_injections enable row level security;
revoke all on public.caleris_admin_wallet_injections from public, anon, authenticated;
grant select on public.caleris_admin_wallet_injections to authenticated;
create policy "Site admins read wallet injection audit"
on public.caleris_admin_wallet_injections for select to authenticated
using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function public.admin_assign_driver_license(
  p_member_id uuid, p_license_label text, p_reason text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_member public.members%rowtype;
  v_previous text;
begin
  if v_actor is null or not exists(select 1 from public.site_admins a where a.user_id=v_actor) then
    raise exception 'Hanya Site Admin yang dapat menetapkan lisensi.';
  end if;
  if p_member_id is null or p_license_label is null or length(trim(p_license_label)) not between 1 and 80
     or p_reason is null or length(trim(p_reason)) not between 3 and 240 then
    raise exception 'Data penetapan lisensi tidak valid.';
  end if;
  if not exists(select 1 from public.caleris_development_license_tier_mapping m
                where m.license_label=trim(p_license_label) and m.is_active and m.license_tier is not null) then
    raise exception 'Lisensi tidak tersedia pada konfigurasi tier aktif.';
  end if;
  select * into v_member from public.members where id=p_member_id and role='Driver' for update;
  if not found then raise exception 'Driver tidak ditemukan.';
  end if;
  v_previous:=v_member.license;
  if v_previous is not distinct from trim(p_license_label) then
    raise exception 'Driver sudah memiliki lisensi tersebut.';
  end if;
  update public.members set license=trim(p_license_label) where id=p_member_id;
  insert into public.caleris_admin_license_assignments(member_id,previous_license,new_license,reason,assigned_by)
  values(p_member_id,v_previous,trim(p_license_label),trim(p_reason),v_actor);
  return jsonb_build_object('member_id',p_member_id,'previous_license',v_previous,'new_license',trim(p_license_label));
end;
$function$;
revoke all on function public.admin_assign_driver_license(uuid,text,text) from public,anon;
grant execute on function public.admin_assign_driver_license(uuid,text,text) to authenticated;

create or replace function public.admin_inject_wallet_balance(
  p_wallet_account_id uuid, p_amount numeric, p_reason text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_target public.economy_wallet_accounts%rowtype;
  v_bank uuid;
  v_sponsor uuid;
  v_funding jsonb;
  v_credit jsonb;
  v_existing public.caleris_admin_wallet_injections%rowtype;
  v_funding_id uuid;
  v_credit_id uuid;
begin
  if v_actor is null or not exists(select 1 from public.site_admins a where a.user_id=v_actor) then
    raise exception 'Hanya Site Admin yang dapat melakukan wallet injection.';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2)
     or p_reason is null or length(trim(p_reason)) not between 3 and 240
     or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then
    raise exception 'Data wallet injection tidak valid.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  select * into v_existing from public.caleris_admin_wallet_injections where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.wallet_account_id<>p_wallet_account_id or v_existing.amount<>p_amount then
      raise exception 'Idempotency key telah digunakan untuk injection berbeda.';
    end if;
    return jsonb_build_object('status','duplicate','injection_id',v_existing.id,
      'funding_transaction_id',v_existing.bank_funding_transaction_id,'credit_transaction_id',v_existing.credit_transaction_id);
  end if;
  select * into v_target from public.economy_wallet_accounts
  where id=p_wallet_account_id and is_active
    and account_kind in ('driver','team_owner','team')
  for update;
  if not found then raise exception 'Wallet tujuan harus berupa wallet Driver, Owner, atau Tim yang aktif.';
  end if;
  select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active for update;
  select id into v_sponsor from public.economy_wallet_accounts where account_kind='sponsor_source' and is_active for update;
  if v_bank is null or v_sponsor is null then raise exception 'Wallet VreeoBank atau Sponsor Source tidak tersedia.';
  end if;

  v_funding:=private.post_economy_transaction(
    v_sponsor,v_bank,p_amount,'bank_funding',
    'Admin wallet injection funding · '||left(trim(p_reason),180),
    'wallet-inject-fund:'||md5(p_idempotency_key),v_actor,
    jsonb_build_object('admin_wallet_injection',true,'idempotency_key',p_idempotency_key,'target_wallet_id',p_wallet_account_id),
    null,false
  );
  v_funding_id:=(v_funding->>'transaction_id')::uuid;
  v_credit:=private.post_economy_transaction(
    v_bank,p_wallet_account_id,p_amount,'admin_adjustment',
    'Admin wallet injection · '||left(trim(p_reason),180),
    'wallet-inject-credit:'||md5(p_idempotency_key),v_actor,
    jsonb_build_object('admin_wallet_injection',true,'idempotency_key',p_idempotency_key,'funding_transaction_id',v_funding_id),
    null,false
  );
  v_credit_id:=(v_credit->>'transaction_id')::uuid;
  insert into public.caleris_admin_wallet_injections(
    wallet_account_id,amount,bank_funding_transaction_id,credit_transaction_id,idempotency_key,reason,injected_by
  ) values(p_wallet_account_id,p_amount,v_funding_id,v_credit_id,p_idempotency_key,trim(p_reason),v_actor)
  returning * into v_existing;
  return jsonb_build_object('status','posted','injection_id',v_existing.id,
    'funding_transaction_id',v_funding_id,'credit_transaction_id',v_credit_id);
end;
$function$;
revoke all on function public.admin_inject_wallet_balance(uuid,numeric,text,text) from public,anon;
grant execute on function public.admin_inject_wallet_balance(uuid,numeric,text,text) to authenticated;

create or replace function private.default_driver_bronze_license()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.role='Driver' and nullif(trim(new.license),'') is null then
    if exists(select 1 from public.caleris_development_license_tier_mapping
              where license_label='Bronze' and license_tier='bronze' and is_active) then
      new.license:='Bronze';
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists members_default_bronze_license on public.members;
create trigger members_default_bronze_license
before insert or update of role,license on public.members
for each row execute function private.default_driver_bronze_license();
revoke all on function private.default_driver_bronze_license() from public,anon,authenticated,service_role;

commit;