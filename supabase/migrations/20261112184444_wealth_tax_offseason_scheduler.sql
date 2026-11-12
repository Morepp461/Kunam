-- Install Supabase Cron for the approved Driver Transfer Window executor.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Wealth Tax collection scheduling is intentionally not installed until its taxable base is confirmed.
