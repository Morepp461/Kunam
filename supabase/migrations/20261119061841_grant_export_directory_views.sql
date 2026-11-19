-- Allow the server-only XLSX export gateway to read the safe directory views.
-- Do not grant these views to anon or authenticated; public access remains unchanged.
GRANT SELECT ON TABLE
  public.caleris_member_directory,
  public.caleris_team_directory
TO service_role;
