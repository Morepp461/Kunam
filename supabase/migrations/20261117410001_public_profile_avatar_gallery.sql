-- Public profile portrait access for the official Driver Exhibition.
-- The public directory exposes only its existing fields plus avatar_path; profile PII remains protected.
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

-- Avatars are public profile artwork. Existing Storage write policies continue
-- to restrict uploads, updates and deletes to the owning account's folder.
UPDATE storage.buckets
SET public = true
WHERE id = 'profile-avatars';
