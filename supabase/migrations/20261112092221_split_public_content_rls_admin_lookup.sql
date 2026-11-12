-- Separate public reads from administrator lookups.
-- The previous combined SELECT policies referenced site_admins for anon requests.
-- anon has no SELECT privilege on site_admins, so public setting/content reads failed.

DROP POLICY IF EXISTS "Read published content or admin" ON public.site_content;
DROP POLICY IF EXISTS "Public can read published site content" ON public.site_content;
DROP POLICY IF EXISTS "Public can read published content" ON public.site_content;
DROP POLICY IF EXISTS "Admins read all site content" ON public.site_content;

CREATE POLICY "Public can read published content"
ON public.site_content
FOR SELECT
TO anon, authenticated
USING (published = true);

CREATE POLICY "Admins read all site content"
ON public.site_content
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.site_admins AS a
    WHERE a.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Read community setting or admin" ON public.site_settings;
DROP POLICY IF EXISTS "Public can read community invite setting" ON public.site_settings;
DROP POLICY IF EXISTS "Public can read community setting" ON public.site_settings;
DROP POLICY IF EXISTS "Admins read all site settings" ON public.site_settings;

CREATE POLICY "Public can read community setting"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (key = 'community_invite_url');

CREATE POLICY "Admins read all site settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.site_admins AS a
    WHERE a.user_id = (SELECT auth.uid())
  )
);
