-- Grant only the exact table privileges required by the Admin UI and audit trigger.
revoke all privileges on table public.caleris_configurations from anon, public, authenticated, service_role;
revoke all privileges on table public.caleris_configuration_revisions from anon, public, authenticated, service_role;

grant select, insert, update, delete on table public.caleris_configurations to authenticated;
grant select, insert on table public.caleris_configuration_revisions to authenticated;
