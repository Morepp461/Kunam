begin;
do $$
begin
 if not exists (
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='caleris_circuits'
 ) then
  alter publication supabase_realtime add table public.caleris_circuits;
 end if;
end $$;
commit;
