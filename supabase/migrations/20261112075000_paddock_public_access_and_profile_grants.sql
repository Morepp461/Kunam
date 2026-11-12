-- Paddock Access completion permissions and public-account lifecycle.
-- New signups remain public until an administrator links a member record.
-- A preferred_role is a request/preference, not an assigned member role.

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO service_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'public';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('public', 'active', 'admin', 'suspended'));

UPDATE public.profiles AS p
SET account_status = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.site_admins AS a WHERE a.user_id = p.user_id
  ) THEN 'admin'
  WHEN p.member_id IS NOT NULL THEN 'active'
  ELSE 'public'
END;
