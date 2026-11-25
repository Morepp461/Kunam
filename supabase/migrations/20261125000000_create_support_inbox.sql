create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null,
  sender_name text,
  recipient_email text not null default 'support@calerismasters.com',
  subject text not null default '(No subject)',
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  sender_email text not null,
  recipient_email text not null,
  subject text,
  body_text text,
  body_html text,
  attachments jsonb not null default '[]'::jsonb,
  provider text not null default 'resend',
  provider_email_id text unique,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_status_last_message_idx on public.support_tickets (status, last_message_at desc);
create index if not exists support_messages_ticket_created_idx on public.support_messages (ticket_id, created_at asc);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Site admins can read support tickets" on public.support_tickets;
create policy "Site admins can read support tickets" on public.support_tickets for select to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));

drop policy if exists "Site admins can update support tickets" on public.support_tickets;
create policy "Site admins can update support tickets" on public.support_tickets for update to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));

drop policy if exists "Site admins can read support messages" on public.support_messages;
create policy "Site admins can read support messages" on public.support_messages for select to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));

grant select, update on public.support_tickets to authenticated;
grant select on public.support_messages to authenticated;
grant all on public.support_tickets to service_role;
grant all on public.support_messages to service_role;
