-- CALERIS License Scoring Engine. Scoring thresholds are data-driven via caleris_configurations.
create table if not exists public.license_seasons (
 id uuid primary key default gen_random_uuid(), season_key text not null unique check(length(trim(season_key)) between 1 and 80),
 title text not null check(length(trim(title)) between 1 and 160), starts_on date not null, ends_on date not null,
 status text not null default 'draft' check(status in ('draft','active','completed')),
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), check(ends_on>=starts_on)
);
create table if not exists public.license_season_divisions (
 id uuid primary key default gen_random_uuid(), season_id uuid not null references public.license_seasons(id) on delete cascade,
 division_key text not null check(division_key ~ '^[a-z0-9-]+$'), division_name text not null check(length(trim(division_name)) between 1 and 100),
 status text not null default 'draft' check(status in ('draft','active','completed')), finalized_at timestamptz,
 finalized_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 unique(season_id,division_key), unique(id,season_id)
);
create table if not exists public.license_season_members (
 id uuid primary key default gen_random_uuid(), season_id uuid not null references public.license_seasons(id) on delete cascade,
 season_division_id uuid not null, member_id uuid not null references public.members(id) on delete restrict,
 is_hiatus boolean not null default false, preserved_license text, consecutive_absent_rounds integer not null default 0 check(consecutive_absent_rounds>=0),
 created_at timestamptz not null default now(), foreign key(season_division_id,season_id) references public.license_season_divisions(id,season_id) on delete cascade,
 unique(member_id,season_id), unique(season_division_id,member_id)
);
create table if not exists public.license_rounds (
 id uuid primary key default gen_random_uuid(), season_division_id uuid not null references public.license_season_divisions(id) on delete cascade,
 round_number integer not null check(round_number>0), title text not null, checkin_opens_at timestamptz not null, checkin_closes_at timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','open','closed')), processed_at timestamptz,
 processed_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), check(checkin_closes_at>checkin_opens_at),
 unique(season_division_id,round_number)
);
create table if not exists public.license_daily_checkins (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id) on delete restrict,
 checkin_date date not null, created_at timestamptz not null default now(), unique(member_id,checkin_date)
);
create table if not exists public.license_round_standings (
 id uuid primary key default gen_random_uuid(), round_id uuid not null references public.license_rounds(id) on delete cascade,
 member_id uuid not null references public.members(id) on delete restrict, points_total numeric(14,2) not null check(points_total>=0),
 updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now(), unique(round_id,member_id)
);
create table if not exists public.license_final_standings (
 id uuid primary key default gen_random_uuid(), season_division_id uuid not null references public.license_season_divisions(id) on delete cascade,
 member_id uuid not null references public.members(id) on delete restrict, final_points numeric(14,2) not null check(final_points>=0),
 final_position integer not null check(final_position>0), updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), unique(season_division_id,member_id), unique(season_division_id,final_position)
);
create table if not exists public.license_score_ledger (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id) on delete restrict,
 season_id uuid references public.license_seasons(id) on delete set null, season_division_id uuid references public.license_season_divisions(id) on delete set null,
 source_type text not null check(source_type in ('daily_checkin','standings_milestone','inactivity_penalty','wdc')),
 points_delta numeric(14,2) not null, idempotency_key text not null unique, description text not null,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists license_season_divisions_season_idx on public.license_season_divisions(season_id,status);
create index if not exists license_season_members_member_idx on public.license_season_members(member_id,season_id);
create index if not exists license_rounds_window_idx on public.license_rounds(season_division_id,checkin_opens_at,checkin_closes_at);
create index if not exists license_checkins_member_date_idx on public.license_daily_checkins(member_id,checkin_date desc);
create index if not exists license_round_standings_member_idx on public.license_round_standings(member_id,round_id);
create index if not exists license_final_standings_champion_idx on public.license_final_standings(season_division_id,final_position);
create index if not exists license_score_ledger_member_season_idx on public.license_score_ledger(member_id,season_id,created_at desc);
alter table public.license_seasons enable row level security;
alter table public.license_season_divisions enable row level security;
alter table public.license_season_members enable row level security;
alter table public.license_rounds enable row level security;
alter table public.license_daily_checkins enable row level security;
alter table public.license_round_standings enable row level security;
alter table public.license_final_standings enable row level security;
alter table public.license_score_ledger enable row level security;
revoke all on public.license_seasons,public.license_season_divisions,public.license_season_members,public.license_rounds,public.license_daily_checkins,public.license_round_standings,public.license_final_standings,public.license_score_ledger from anon,authenticated,service_role,public;
grant select,insert,update,delete on public.license_seasons,public.license_season_divisions,public.license_season_members,public.license_rounds,public.license_round_standings,public.license_final_standings to authenticated;
grant select,insert on public.license_daily_checkins to authenticated;
grant select on public.license_score_ledger to authenticated;
create policy "License admins manage seasons" on public.license_seasons for all to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "License admins manage divisions" on public.license_season_divisions for all to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "License admins manage season drivers" on public.license_season_members for all to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Drivers read own season registration" on public.license_season_members for select to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=license_season_members.member_id));
create policy "License admins manage rounds" on public.license_rounds for all to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "License admins manage round standings" on public.license_round_standings for all to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "License admins manage final standings" on public.license_final_standings for all to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Drivers read own checkins" on public.license_daily_checkins for select to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=license_daily_checkins.member_id) or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Drivers insert own daily checkin" on public.license_daily_checkins for insert to authenticated with check(checkin_date=(now() at time zone 'Asia/Jakarta')::date and exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and p.member_id=license_daily_checkins.member_id and m.role='Driver'));
create policy "Members read own license score ledger" on public.license_score_ledger for select to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=license_score_ledger.member_id) or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
insert into public.caleris_configurations(category,config_key,title,payload,is_active,sort_order) values
('license','scoring-daily-checkin','Daily Check-in Score','{"points":2}'::jsonb,true,10),
('license','scoring-inactivity','Inactivity Penalty','{"absence_races":5,"penalty_points":10}'::jsonb,true,20),
('license','scoring-milestone-80','Standings Milestone 1','{"minimum_standings_points":80,"license_points":10}'::jsonb,true,30),
('license','scoring-milestone-150','Standings Milestone 2','{"minimum_standings_points":150,"license_points":15}'::jsonb,true,40),
('license','scoring-milestone-250','Standings Milestone 3','{"minimum_standings_points":250,"license_points":30}'::jsonb,true,50),
('license','scoring-wdc-premio','WDC Score · Premio','{"points":0,"requires_admin_setup":true}'::jsonb,false,60),
('license','scoring-wdc-zwei','WDC Score · Zwei','{"points":0,"requires_admin_setup":true}'::jsonb,false,70)
on conflict(category,config_key) do nothing;
create or replace function public.license_apply_checkin_score() returns trigger language plpgsql security definer set search_path='' as $$
declare v_season_id uuid;v_division_id uuid;v_points numeric;v_config public.caleris_configurations%rowtype;
begin
 select sm.season_id,sm.season_division_id into v_season_id,v_division_id from public.license_season_members sm
 join public.license_seasons s on s.id=sm.season_id and s.status='active'
 join public.license_season_divisions sd on sd.id=sm.season_division_id and sd.status='active'
 where sm.member_id=new.member_id and not sm.is_hiatus and new.checkin_date between s.starts_on and s.ends_on limit 1;
 if v_season_id is null then raise exception 'Tidak ada season dan divisi lisensi aktif untuk driver ini.'; end if;
 if not exists(select 1 from public.license_rounds r where r.season_division_id=v_division_id and r.round_number=(select min(r2.round_number) from public.license_rounds r2 where r2.season_division_id=v_division_id) and new.checkin_date >= (r.checkin_opens_at at time zone 'Asia/Jakarta')::date) then raise exception 'Perhitungan lisensi belum dimulai. Check-in poin dimulai pada Round 1.'; end if;
 select c.* into v_config from public.caleris_configurations c where c.category='license' and c.config_key='scoring-daily-checkin' and c.is_active;
 v_points:=nullif(v_config.payload->>'points','')::numeric;
 if v_points is null or v_points<=0 then raise exception 'Konfigurasi poin daily check-in belum valid.'; end if;
 insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
 values(new.member_id,v_season_id,v_division_id,'daily_checkin',v_points,'checkin:'||new.id::text,'Daily check-in',jsonb_build_object('checkin_id',new.id,'checkin_date',new.checkin_date));
 return new;
end;$$;
create trigger license_daily_checkin_score after insert on public.license_daily_checkins for each row execute function public.license_apply_checkin_score();
create or replace function public.license_apply_standings_milestones() returns trigger language plpgsql security definer set search_path='' as $$
declare v_season_id uuid;v_division_id uuid;v_config record;v_member_role text;v_threshold numeric;v_reward numeric;
begin
 select r.season_division_id,sd.season_id into v_division_id,v_season_id from public.license_rounds r join public.license_season_divisions sd on sd.id=r.season_division_id where r.id=new.round_id and r.status<>'closed';
 if v_division_id is null then raise exception 'Round tidak ditemukan atau sudah ditutup.'; end if;
 select m.role into v_member_role from public.members m where m.id=new.member_id;
 if v_member_role<>'Driver' or not exists(select 1 from public.license_season_members sm where sm.season_division_id=v_division_id and sm.member_id=new.member_id and not sm.is_hiatus) then raise exception 'Hanya driver aktif yang terdaftar pada divisi season ini yang dapat memperoleh milestone.'; end if;
 for v_config in select c.config_key,c.payload from public.caleris_configurations c where c.category='license' and c.is_active and c.config_key like 'scoring-milestone-%' loop
  v_threshold:=nullif(v_config.payload->>'minimum_standings_points','')::numeric;v_reward:=nullif(v_config.payload->>'license_points','')::numeric;
  if v_threshold is null or v_threshold<=0 or v_reward is null or v_reward<=0 then raise exception 'Konfigurasi milestone % belum valid.',v_config.config_key; end if;
  if new.points_total>=v_threshold then
   insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
   values(new.member_id,v_season_id,v_division_id,'standings_milestone',v_reward,'milestone:'||v_division_id::text||':'||new.member_id::text||':'||v_config.config_key,'Standings milestone: '||v_config.config_key,jsonb_build_object('round_id',new.round_id,'points_total',new.points_total,'configuration_key',v_config.config_key)) on conflict(idempotency_key) do nothing;
  end if;
 end loop;return new;
end;$$;
create trigger license_standings_milestone_score after insert or update of points_total on public.license_round_standings for each row execute function public.license_apply_standings_milestones();
create or replace function public.process_license_round(p_round_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_round public.license_rounds%rowtype;v_rule public.caleris_configurations%rowtype;v_member record;v_streak integer;v_threshold integer;v_penalty numeric;v_current numeric;v_delta numeric;v_processed integer:=0;
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat memproses round.'; end if;
 select * into v_round from public.license_rounds where id=p_round_id for update;if not found then raise exception 'Round tidak ditemukan.';end if;
 if v_round.status='closed' then raise exception 'Round sudah diproses.';end if;if v_round.checkin_closes_at>now() then raise exception 'Periode check-in round ini belum berakhir.';end if;
 select * into v_rule from public.caleris_configurations where category='license' and config_key='scoring-inactivity' and is_active;
 v_threshold:=nullif(v_rule.payload->>'absence_races','')::integer;v_penalty:=nullif(v_rule.payload->>'penalty_points','')::numeric;
 if v_threshold is null or v_threshold<=0 or v_penalty is null or v_penalty<=0 then raise exception 'Konfigurasi inactivity penalty belum valid.';end if;
 for v_member in select sm.member_id,sm.season_id,sm.consecutive_absent_rounds from public.license_season_members sm where sm.season_division_id=v_round.season_division_id and not sm.is_hiatus loop
  if exists(select 1 from public.license_daily_checkins c where c.member_id=v_member.member_id and c.checkin_date between (v_round.checkin_opens_at at time zone 'Asia/Jakarta')::date and (v_round.checkin_closes_at at time zone 'Asia/Jakarta')::date) then v_streak:=0;
  else v_streak:=v_member.consecutive_absent_rounds+1;
   if v_streak>=v_threshold and mod(v_streak,v_threshold)=0 then
    select coalesce(sum(l.points_delta),0) into v_current from public.license_score_ledger l where l.member_id=v_member.member_id and l.season_id=v_member.season_id and l.source_type<>'wdc';
    v_delta:=-least(v_penalty,greatest(v_current,0));
    if v_delta<0 then insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
     values(v_member.member_id,v_member.season_id,v_round.season_division_id,'inactivity_penalty',v_delta,'absence:'||v_round.id::text||':'||v_member.member_id::text,'Inactivity penalty after consecutive rounds without daily check-in',jsonb_build_object('round_id',v_round.id,'absence_streak',v_streak,'configured_penalty',v_penalty)) on conflict(idempotency_key) do nothing;end if;
   end if;
  end if;
  update public.license_season_members set consecutive_absent_rounds=v_streak where season_division_id=v_round.season_division_id and member_id=v_member.member_id;v_processed:=v_processed+1;
 end loop;
 update public.license_rounds set status='closed',processed_at=now(),processed_by=(select auth.uid()) where id=p_round_id;
 return jsonb_build_object('round_id',p_round_id,'drivers_processed',v_processed,'status','closed');
end;$$;
create or replace function public.finalize_license_division(p_season_division_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_division public.license_season_divisions%rowtype;v_champion public.license_final_standings%rowtype;v_member_role text;v_config_key text;v_points numeric;v_round_count integer;v_open_round_count integer;
begin
 if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat mengesahkan juara WDC.';end if;
 select * into v_division from public.license_season_divisions where id=p_season_division_id for update;if not found then raise exception 'Divisi season tidak ditemukan.';end if;
 if v_division.status='completed' then raise exception 'Divisi ini sudah difinalisasi. Bonus WDC tidak dapat diberikan ulang.';end if;
 select count(*),count(*) filter(where status<>'closed') into v_round_count,v_open_round_count from public.license_rounds where season_division_id=p_season_division_id;
 if v_round_count=0 or v_open_round_count>0 then raise exception 'Semua round harus tersedia dan diproses sebelum WDC disahkan.';end if;
 select count(*) into v_round_count from public.license_final_standings where season_division_id=p_season_division_id and final_position=1;
 if v_round_count<>1 then raise exception 'WDC harus memiliki tepat satu juara posisi pertama.';end if;
 select * into v_champion from public.license_final_standings where season_division_id=p_season_division_id and final_position=1;
 select role into v_member_role from public.members where id=v_champion.member_id;
 if v_member_role<>'Driver' or not exists(select 1 from public.license_season_members sm where sm.season_division_id=p_season_division_id and sm.member_id=v_champion.member_id and not sm.is_hiatus) then raise exception 'Juara WDC harus merupakan Driver aktif yang terdaftar pada divisi season ini.';end if;
 v_config_key:='scoring-wdc-'||v_division.division_key;
 select nullif(payload->>'points','')::numeric into v_points from public.caleris_configurations where category='license' and config_key=v_config_key and is_active;
 if v_points is null or v_points<=0 then raise exception 'Poin WDC untuk divisi ini belum diatur oleh Admin.';end if;
 insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
 select v_champion.member_id,v_division.season_id,p_season_division_id,'wdc',v_points,'wdc:'||p_season_division_id::text||':'||v_champion.member_id::text,'Official WDC Champion · '||v_division.division_name,jsonb_build_object('final_position',v_champion.final_position,'final_points',v_champion.final_points,'division_key',v_division.division_key)
 where not exists(select 1 from public.license_score_ledger l where l.season_division_id=p_season_division_id and l.source_type='wdc');
 if not found then raise exception 'Bonus WDC untuk divisi ini sudah pernah diberikan.';end if;
 update public.license_season_divisions set status='completed',finalized_at=now(),finalized_by=(select auth.uid()) where id=p_season_division_id;
 return jsonb_build_object('division_id',p_season_division_id,'champion_member_id',v_champion.member_id,'wdc_points',v_points,'status','completed');
end;$$;
create or replace function public.guard_license_final_standings() returns trigger language plpgsql set search_path='' as $$
declare v_id uuid;begin v_id:=case when tg_op='DELETE' then old.season_division_id else new.season_division_id end;
 if exists(select 1 from public.license_season_divisions where id=v_id and status='completed') then raise exception 'Final standings terkunci setelah WDC disahkan.';end if;
 if tg_op='DELETE' then return old;end if;return new;end;$$;
create trigger license_final_standings_lock before insert or update or delete on public.license_final_standings for each row execute function public.guard_license_final_standings();
revoke all on function public.license_apply_checkin_score() from public,anon,authenticated,service_role;
revoke all on function public.license_apply_standings_milestones() from public,anon,authenticated,service_role;
revoke all on function public.guard_license_final_standings() from public,anon,authenticated,service_role;
revoke all on function public.process_license_round(uuid) from public,anon,service_role;
revoke all on function public.finalize_license_division(uuid) from public,anon,service_role;
grant execute on function public.process_license_round(uuid) to authenticated;
grant execute on function public.finalize_license_division(uuid) to authenticated;
