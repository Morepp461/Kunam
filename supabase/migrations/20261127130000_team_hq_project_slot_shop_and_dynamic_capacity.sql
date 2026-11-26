-- Add the approved paid Team HQ project slot and dynamic project capacity.
create table if not exists public.caleris_team_hq_slot_shop_config (
 singleton boolean primary key default true check(singleton), price_eur numeric(14,2), is_active boolean not null default false,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 constraint caleris_team_hq_slot_price_positive check(price_eur is null or price_eur>0)
);
insert into public.caleris_team_hq_slot_shop_config(singleton,price_eur,is_active) values(true,null,false) on conflict(singleton) do nothing;
create table if not exists public.caleris_team_hq_slot_entitlements (
 id uuid primary key default gen_random_uuid(), team_id uuid not null unique references public.teams(id) on delete cascade,
 purchased_by uuid not null references auth.users(id), transaction_id uuid not null unique references public.economy_transactions(id),
 purchased_at timestamptz not null default now()
);
alter table public.caleris_team_hq_slot_shop_config enable row level security;
alter table public.caleris_team_hq_slot_entitlements enable row level security;
revoke all on public.caleris_team_hq_slot_shop_config from public,anon,authenticated;
revoke all on public.caleris_team_hq_slot_entitlements from public,anon,authenticated;
create or replace function public.admin_set_team_hq_slot_shop_item(p_price_eur numeric,p_is_active boolean) returns jsonb language plpgsql security definer set search_path='' as $function$ begin
if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Admin only.'; end if;
if p_price_eur is null or p_price_eur<=0 or p_price_eur<>round(p_price_eur,2) then raise exception 'Harga item slot upgrade harus lebih dari €0 dan maksimal 2 angka desimal.'; end if;
insert into public.caleris_team_hq_slot_shop_config(singleton,price_eur,is_active,updated_by,updated_at) values(true,p_price_eur,p_is_active,(select auth.uid()),now()) on conflict(singleton) do update set price_eur=excluded.price_eur,is_active=excluded.is_active,updated_by=excluded.updated_by,updated_at=now();
return jsonb_build_object('price_eur',p_price_eur,'is_active',p_is_active); end;$function$;
create or replace function public.member_get_team_hq_project_capacity() returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare m public.members%rowtype; f integer:=0; s integer:=0; a integer:=0; p numeric; enabled boolean:=false;
begin if (select auth.uid()) is null then raise exception 'Login diperlukan.'; end if;
select x.* into m from public.profiles pr join public.members x on x.id=pr.member_id where pr.user_id=(select auth.uid());
if not found or m.team_id is null then raise exception 'Akun belum terhubung ke tim.'; end if;
select round(greatest(0,coalesce((private.team_hq_effects_for_team(m.team_id)->>'factory_production_capacity_bonus')::numeric,0)))::integer into f;
select case when exists(select 1 from public.caleris_team_hq_slot_entitlements where team_id=m.team_id) then 1 else 0 end into s;
select count(*)::integer into a from public.caleris_team_hq_projects where team_id=m.team_id and status in ('queued','in_progress');
select price_eur,is_active into p,enabled from public.caleris_team_hq_slot_shop_config where singleton=true;
return jsonb_build_object('base_limit',2,'factory_bonus',least(1,f),'shop_bonus',s,'active_projects',a,'max_projects',least(4,2+least(1,f)+s),'shop_item_owned',s=1,'shop_item_active',coalesce(enabled,false),'shop_item_price_eur',p); end;$function$;
create or replace function public.member_purchase_team_hq_project_slot(p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $function$
declare uid uuid:=(select auth.uid()); m public.members%rowtype; c public.caleris_team_hq_slot_shop_config%rowtype; w public.economy_wallet_accounts%rowtype; b public.economy_wallet_accounts%rowtype; ex public.economy_transactions%rowtype; res jsonb; tx uuid; price numeric;
begin if uid is null then raise exception 'Sesi login tidak ditemukan.'; end if;
if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then raise exception 'Kunci transaksi tidak valid.'; end if;
select x.* into m from public.profiles p join public.members x on x.id=p.member_id where p.user_id=uid for update of x;
if not found or m.role<>'Owner' or m.team_id is null then raise exception 'Hanya Team Owner yang dapat membeli tambahan slot upgrade HQ.'; end if;
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('team-hq:'||m.team_id::text,0));
if exists(select 1 from public.caleris_team_hq_slot_entitlements where team_id=m.team_id) then return jsonb_build_object('status','already_owned'); end if;
select * into c from public.caleris_team_hq_slot_shop_config where singleton=true for update;
if not found or not c.is_active or c.price_eur is null or c.price_eur<=0 then raise exception 'Item tambahan slot upgrade belum tersedia di Shop.'; end if;
price:=c.price_eur;
select * into ex from public.economy_transactions where idempotency_key=p_idempotency_key;
if found then if ex.event_type<>'team_hq_project_slot_purchase' or ex.metadata->>'team_id'<>m.team_id::text then raise exception 'Kunci transaksi telah digunakan untuk transaksi lain.'; end if; tx:=ex.id;
else
select * into w from public.economy_wallet_accounts where account_kind='team' and team_id=m.team_id and is_active for update; if not found then raise exception 'Team Wallet belum tersedia.'; end if;
select * into b from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active for update; if not found then raise exception 'Wallet VreeoBank tidak tersedia.'; end if;
res:=private.post_economy_transaction(w.id,b.id,price,'team_hq_project_slot_purchase','Shop: tambahan satu slot upgrade Team HQ',p_idempotency_key,uid,jsonb_build_object('team_id',m.team_id,'item_key','team_hq_project_slot_plus_one'),null,false);
tx:=(res->>'transaction_id')::uuid; end if;
insert into public.caleris_team_hq_slot_entitlements(team_id,purchased_by,transaction_id) values(m.team_id,uid,tx) on conflict(team_id) do nothing;
return jsonb_build_object('status','purchased','team_id',m.team_id,'transaction_id',tx,'price_eur',price); end;$function$;
revoke all on function public.admin_set_team_hq_slot_shop_item(numeric,boolean) from public,anon;
revoke all on function public.member_get_team_hq_project_capacity() from public,anon;
revoke all on function public.member_purchase_team_hq_project_slot(text) from public,anon;
grant execute on function public.admin_set_team_hq_slot_shop_item(numeric,boolean) to authenticated;
grant execute on function public.member_get_team_hq_project_capacity() to authenticated;
grant execute on function public.member_purchase_team_hq_project_slot(text) to authenticated;
do $patch$ declare d text; old text; replacement text; begin
d:=pg_get_functiondef('public.member_start_team_hq_project(text,text)'::regprocedure);
d:=replace(d,' v_active integer;',E' v_active integer;\n v_factory_bonus integer:=0;\n v_shop_bonus integer:=0;\n v_project_limit integer:=2;');
old:='if v_active>=2 then raise exception ''Maksimal dua proyek HQ dapat berjalan bersamaan.''; end if;';
replacement:='select round(greatest(0,coalesce((private.team_hq_effects_for_team(v_team.id)->>''factory_production_capacity_bonus'')::numeric,0)))::integer into v_factory_bonus;
select case when exists(select 1 from public.caleris_team_hq_slot_entitlements where team_id=v_team.id) then 1 else 0 end into v_shop_bonus;
v_project_limit:=least(4,2+least(1,v_factory_bonus)+v_shop_bonus);
if v_active>=v_project_limit then raise exception ''Kapasitas proyek upgrade HQ penuh.''; end if;';
if position(old in d)=0 then raise exception 'Team HQ project capacity check changed; refusing unsafe patch.'; end if;
d:=replace(d,old,replacement); execute d; end;$patch$;
