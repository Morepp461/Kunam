-- Preserve the previous Account Settings behavior: avatar_path is canonical,
-- and legacy avatar_url must never retain a stale/non-signed URL.
create or replace function public.member_update_profile_settings(
  p_avatar_path text,
  p_web_nickname text,
  p_driver_nickname text,
  p_first_name text,
  p_last_name text,
  p_nationality text,
  p_hometown text,
  p_preferred_language text
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_preferred_language is null or p_preferred_language not in ('id', 'en') then
    raise exception 'Preferred language must be id or en.' using errcode = '22023';
  end if;
  if length(coalesce(p_web_nickname, '')) > 32
    or length(coalesce(p_driver_nickname, '')) > 32
    or length(coalesce(p_first_name, '')) > 80
    or length(coalesce(p_last_name, '')) > 80
    or length(coalesce(p_nationality, '')) > 80
    or length(coalesce(p_hometown, '')) > 120 then
    raise exception 'Profile setting exceeds the allowed length.' using errcode = '22023';
  end if;
  if nullif(btrim(p_nationality), '') is null or nullif(btrim(p_hometown), '') is null then
    raise exception 'Nationality and hometown are required.' using errcode = '22023';
  end if;
  if p_avatar_path is not null and (
    p_avatar_path !~ ('^' || v_user_id::text || '/[^/]+$')
    or position('..' in p_avatar_path) > 0
  ) then
    raise exception 'Avatar path must belong to the authenticated user.' using errcode = '42501';
  end if;

  update public.profiles
  set avatar_url = null,
      avatar_path = p_avatar_path,
      web_nickname = nullif(btrim(p_web_nickname), ''),
      driver_nickname = nullif(btrim(p_driver_nickname), ''),
      first_name = nullif(btrim(p_first_name), ''),
      last_name = nullif(btrim(p_last_name), ''),
      nationality = nullif(btrim(p_nationality), ''),
      hometown = nullif(btrim(p_hometown), ''),
      preferred_language = p_preferred_language,
      updated_at = now()
  where user_id = v_user_id;

  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.member_update_profile_settings(text,text,text,text,text,text,text,text)
  from public, anon, service_role;
grant execute on function public.member_update_profile_settings(text,text,text,text,text,text,text,text)
  to authenticated;
comment on function public.member_update_profile_settings(text,text,text,text,text,text,text,text) is
  'Updates only self-service account profile fields, clears legacy avatar_url, and leaves direct authenticated profile writes revoked.';
