-- Admin write access for configurable Operations Suite records.
grant insert,update,delete on public.caleris_tax_rules,
  public.caleris_race_reward_rules,public.caleris_sponsors,
  public.caleris_team_valuations to authenticated;

create policy "Admin manages tax rules"
on public.caleris_tax_rules for all to authenticated
using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create policy "Admin manages race reward rules"
on public.caleris_race_reward_rules for all to authenticated
using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create policy "Admin manages sponsor pool"
on public.caleris_sponsors for all to authenticated
using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create policy "Admin manages team valuations"
on public.caleris_team_valuations for all to authenticated
using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
