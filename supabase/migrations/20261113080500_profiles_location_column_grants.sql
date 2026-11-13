-- The account settings form upserts the profile's self-service fields.
-- RLS already limits updates to auth.uid(); only grant the two newly-added
-- location columns, not protected member, role, team, or economy fields.
GRANT INSERT (nationality, hometown) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (nationality, hometown) ON TABLE public.profiles TO authenticated;
