CREATE OR REPLACE FUNCTION public.admin_change_public_member_id(
  p_target_member_id text, p_new_member_id text, p_changed_by uuid
)
RETURNS TABLE(old_member_id text,new_member_id text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target_user_id uuid; previous_id text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.site_admins a WHERE a.user_id=p_changed_by) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
  END IF;
  IF p_new_member_id IS NULL OR p_new_member_id !~ '^[A-Z0-9]{12,16}$'
    OR p_new_member_id !~ '[A-Z]' OR p_new_member_id !~ '[0-9]' THEN
    RAISE EXCEPTION 'Member ID must contain 12-16 uppercase letters and digits' USING ERRCODE='22023';
  END IF;
  SELECT p.user_id,p.public_member_id INTO target_user_id,previous_id
  FROM public.profiles p WHERE p.public_member_id=p_target_member_id FOR UPDATE;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Member ID not found' USING ERRCODE='P0002';
  END IF;
  IF previous_id=p_new_member_id THEN
    RETURN QUERY SELECT previous_id,previous_id; RETURN;
  END IF;
  UPDATE public.profiles SET public_member_id=p_new_member_id,updated_at=now() WHERE user_id=target_user_id;
  INSERT INTO public.member_id_change_logs(profile_user_id,changed_by,old_member_id,new_member_id)
  VALUES(target_user_id,p_changed_by,previous_id,p_new_member_id);
  RETURN QUERY SELECT previous_id,p_new_member_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_change_public_member_id(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_public_member_id(text,text,uuid) TO service_role;
