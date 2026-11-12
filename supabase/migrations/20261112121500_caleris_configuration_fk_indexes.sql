-- Cover the configuration audit foreign keys to keep administrator history lookups efficient.
create index if not exists caleris_configurations_created_by_idx
  on public.caleris_configurations (created_by);
create index if not exists caleris_configurations_updated_by_idx
  on public.caleris_configurations (updated_by);
create index if not exists caleris_configuration_revisions_changed_by_idx
  on public.caleris_configuration_revisions (changed_by);
