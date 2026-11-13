-- The team development seeding routine is trigger-only. Some environments
-- contain the legacy trigger function while others do not.
do $$
begin
  if to_regprocedure('public.seed_team_development_parts()') is not null then
    execute 'revoke all privileges on function public.seed_team_development_parts() from public, anon, authenticated';
  end if;
end;
$$;