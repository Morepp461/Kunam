-- Add provenance-aware circuit geometry draft storage without changing existing circuit records.
alter table public.caleris_circuits
  add column if not exists geometry_draft jsonb,
  add column if not exists source_provenance jsonb,
  add column if not exists geometry_status text not null default 'missing';

alter table public.caleris_circuits
  drop constraint if exists caleris_circuits_geometry_status_check;
alter table public.caleris_circuits
  add constraint caleris_circuits_geometry_status_check
  check (geometry_status in ('missing','unverified','verified','rejected')) not valid;
alter table public.caleris_circuits
  validate constraint caleris_circuits_geometry_status_check;

alter table public.caleris_circuits
  drop constraint if exists caleris_circuits_geometry_provenance_check;
alter table public.caleris_circuits
  add constraint caleris_circuits_geometry_provenance_check
  check (
    (geometry_status = 'missing' and geometry_draft is null and source_provenance is null)
    or
    (geometry_status <> 'missing' and geometry_draft is not null and source_provenance is not null)
  ) not valid;
alter table public.caleris_circuits
  validate constraint caleris_circuits_geometry_provenance_check;
