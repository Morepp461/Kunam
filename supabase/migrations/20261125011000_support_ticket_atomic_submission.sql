create or replace function public.support_create_ticket(
  p_subject text,
  p_body text,
  p_priority text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_ticket_id uuid;
  v_subject text := left(trim(coalesce(p_subject,'')),180);
  v_body text := trim(coalesce(p_body,''));
  v_priority text := coalesce(p_priority,'normal');
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Authentication required.';
  end if;
  if length(v_subject) < 4 or length(v_body) < 10 or length(v_body) > 12000 then
    raise exception 'Subject or report body is outside the allowed length.';
  end if;
  if v_priority not in ('low','normal','high') then
    raise exception 'Invalid support priority.';
  end if;

  insert into public.support_tickets (
    user_id, sender_email, recipient_email, subject, status, priority
  ) values (
    v_user_id, v_email, 'support@calerismasters.com', v_subject, 'open', v_priority
  ) returning id into v_ticket_id;

  insert into public.support_messages (
    ticket_id, direction, sender_email, recipient_email, subject, body_text, provider
  ) values (
    v_ticket_id, 'inbound', v_email, 'support@calerismasters.com', v_subject, v_body, 'website'
  );

  return v_ticket_id;
end;
$$;

revoke all on function public.support_create_ticket(text,text,text) from public, anon;
grant execute on function public.support_create_ticket(text,text,text) to authenticated;
