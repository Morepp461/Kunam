-- Public display access for profile portraits used in the official Driver Exhibition.
-- Only avatar_path is added to the existing public directory view; profile PII remains behind profiles RLS.
CREATE OR REPLACE VIEW public.caleris_member_directory AS
SELECT
  m.id,
  m.character_name,
  m.role,
  m.team_id,
  m.license,
  p.public_member_id,
  p.nationality,
  p.avatar_path
FROM public.members AS m
LEFT JOIN public.profiles AS p ON p.member_id = m.id;

-- Avatar images are intended to be publicly visible profile artwork.
-- Existing INSERT/UPDATE/DELETE policies still restrict writes to each account's own folder.
UPDATE storage.buckets
SET public = true
WHERE id = 'profile-avatars';
