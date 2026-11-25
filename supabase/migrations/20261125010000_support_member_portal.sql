alter table public.support_tickets
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists support_tickets_user_last_message_idx
  on public.support_tickets (user_id, last_message_at desc);

drop policy if exists "Members can read own support tickets" on public.support_tickets;
create policy "Members can read own support tickets" on public.support_tickets
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Members can create own support tickets" on public.support_tickets;
create policy "Members can create own support tickets" on public.support_tickets
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and lower(sender_email) = lower((select auth.jwt()->>'email'))
  );

drop policy if exists "Members can read own support messages" on public.support_messages;
create policy "Members can read own support messages" on public.support_messages
  for select to authenticated using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
  );

drop policy if exists "Members can reply to own support tickets" on public.support_messages;
create policy "Members can reply to own support tickets" on public.support_messages
  for insert to authenticated with check (
    direction = 'inbound'
    and lower(sender_email) = lower((select auth.jwt()->>'email'))
    and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
  );

create or replace function public.support_touch_ticket()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.support_tickets
  set last_message_at = new.created_at, updated_at = now()
  where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists support_message_touch_ticket on public.support_messages;
create trigger support_message_touch_ticket
after insert on public.support_messages
for each row execute function public.support_touch_ticket();

grant insert on public.support_tickets to authenticated;
grant insert on public.support_messages to authenticated;
