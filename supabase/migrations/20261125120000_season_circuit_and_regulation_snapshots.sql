-- Preserve the Circuit Pool relationship on every race round and prepare
-- independent, unpublished regulation snapshots for the next season.
begin;

alter table public.license_rounds add column if not exists circuit_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.license_rounds'::regclass and conname='license_rounds_circuit_id_fkey') then
    alter table public.license_rounds add constraint license_rounds_circuit_id_fkey
      foreign key (circuit_id) references public.caleris_circuits(id) on delete set null;
  end if;
end $$;

-- Backfill only unique exact name/country matches. Ambiguous historic rows
-- retain their text snapshots and remain available for manual reconciliation.
with matches as (
  select r.id, (array_agg(c.id))[1] as circuit_id, count(c.id) as match_count
  from public.license_rounds r
  join public.caleris_circuits c
    on lower(trim(c.name))=lower(trim(r.circuit_name))
   and lower(coalesce(c.country_code,''))=lower(coalesce(r.circuit_country_code,''))
  where r.circuit_id is null and r.circuit_name is not null
  group by r.id
)
update public.license_rounds r set circuit_id=m.circuit_id
from matches m where r.id=m.id and m.match_count=1;

create index if not exists license_rounds_circuit_id_idx on public.license_rounds(circuit_id);

alter table public.caleris_regulations add column if not exists copied_from_regulation_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.caleris_regulations'::regclass and conname='caleris_regulations_copied_from_fkey') then
    alter table public.caleris_regulations add constraint caleris_regulations_copied_from_fkey
      foreign key (copied_from_regulation_id) references public.caleris_regulations(id) on delete set null;
  end if;
end $$;

create index if not exists caleris_regulations_season_draft_idx on public.caleris_regulations(season_id,is_published);

-- Each season receives independent unpublished copies of the latest season's
-- seasonal regulations. Source rows and previous season history are untouched.
create or replace function private.copy_previous_season_regulations()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_source_season_id uuid;
begin
  select s.id into v_source_season_id
  from public.license_seasons s
  where s.id<>new.id
    and exists (select 1 from public.caleris_regulations r where r.season_id=s.id and r.scope_kind='seasonal')
  order by s.created_at desc,s.starts_on desc limit 1;

  if v_source_season_id is null then return new; end if;

  insert into public.caleris_regulations(
    title,body,scope_kind,division_key,season_id,version_label,
    is_published,published_at,created_by,copied_from_regulation_id
  )
  select r.title,r.body,'seasonal',r.division_key,new.id,
    coalesce(r.version_label,'') || ' · Draft ' || new.title,
    false,null,new.created_by,r.id
  from public.caleris_regulations r
  where r.season_id=v_source_season_id and r.scope_kind='seasonal'
    and not exists (
      select 1 from public.caleris_regulations existing
      where existing.season_id=new.id and existing.copied_from_regulation_id=r.id
    );
  return new;
end;
$$;

drop trigger if exists license_seasons_copy_previous_regulations on public.license_seasons;
create trigger license_seasons_copy_previous_regulations
after insert on public.license_seasons
for each row execute function private.copy_previous_season_regulations();

revoke all on function private.copy_previous_season_regulations() from public,anon,authenticated;
commit;
