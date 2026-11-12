-- Restore the server-side read privileges required by member-directory.
-- These grants apply only to service_role; anon/authenticated access is unchanged.
grant usage on schema public to service_role;
grant select on table
  public.profiles,
  public.members,
  public.teams,
  public.site_admins,
  public.site_content
to service_role;
