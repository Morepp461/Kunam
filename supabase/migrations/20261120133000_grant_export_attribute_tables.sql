-- The XLSX export Edge Function uses the server-only service_role.
-- Grant read access to the exact attribute/profile tables it queries.
-- No grants are added for anon or authenticated roles.
GRANT SELECT ON TABLE
  public.caleris_driver_attributes,
  public.caleris_driver_development_attributes,
  public.caleris_team_development_parts,
  public.caleris_team_profiles
TO service_role;
