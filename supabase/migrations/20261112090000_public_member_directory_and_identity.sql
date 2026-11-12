-- Public profile identity, safe directory support, and optional account names.
CREATE OR REPLACE FUNCTION public.generate_public_member_id()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE candidate text;
BEGIN
  LOOP
    SELECT string_agg(ch, '' ORDER BY random()) INTO candidate
    FROM (
      SELECT substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random()*26)::int+1, 1) AS ch FROM generate_series(1,8)
      UNION ALL
      SELECT substr('0123456789', floor(random()*10)::int+1, 1) AS ch FROM generate_series(1,8)
    ) AS chars;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.public_member_id=candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_member_id text;

CREATE OR REPLACE FUNCTION public.assign_public_member_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.public_member_id IS NULL OR btrim(NEW.public_member_id)='' THEN
    NEW.public_member_id := public.generate_public_member_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_public_member_id ON public.profiles;
CREATE TRIGGER profiles_assign_public_member_id
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_public_member_id();

UPDATE public.profiles SET public_member_id=public.generate_public_member_id()
WHERE public_member_id IS NULL OR btrim(public_member_id)='';

ALTER TABLE public.profiles ALTER COLUMN public_member_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_member_id_uidx ON public.profiles(public_member_id);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_public_member_id_format_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_public_member_id_format_check
CHECK (public_member_id ~ '^[A-Z0-9]{12,16}$' AND public_member_id ~ '[A-Z]' AND public_member_id ~ '[0-9]');

CREATE TABLE IF NOT EXISTS public.member_id_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  old_member_id text NOT NULL,
  new_member_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_id_change_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read member ID change logs" ON public.member_id_change_logs;
CREATE POLICY "Admins read member ID change logs" ON public.member_id_change_logs
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.site_admins a WHERE a.user_id=(SELECT auth.uid()))
);
GRANT SELECT ON public.member_id_change_logs TO authenticated;
GRANT INSERT (first_name,last_name) ON public.profiles TO authenticated;
GRANT UPDATE (first_name,last_name) ON public.profiles TO authenticated;
