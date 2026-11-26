-- Profile language preference and durable notification deletion tombstones.
alter table public.profiles
  add column if not exists preferred_language text not null default 'id';

update public.profiles set preferred_language='id' where preferred_language is null;

alter table public.profiles alter column preferred_language set default 'id';
alter table public.profiles alter column preferred_language set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass
      and conname='profiles_preferred_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_language_check
      check (preferred_language in ('id','en'));
  end if;
end $$;

comment on column public.profiles.preferred_language is
  'Preferred CALERIS MASTERS interface language: id or en.';

create table if not exists public.caleris_notification_deletion_tombstones (
  idempotency_key text primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  deleted_at timestamptz not null default now()
);

alter table public.caleris_notification_deletion_tombstones enable row level security;
revoke all on table public.caleris_notification_deletion_tombstones from public, anon, authenticated, service_role;
comment on table public.caleris_notification_deletion_tombstones is
  'Durable per-member suppression keys preventing deleted notifications from being re-enqueued.';

create or replace function private.enqueue_caleris_notification(
  p_member_id uuid,
  p_category text,
  p_title text,
  p_body text,
  p_href text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_member_id uuid default null::uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_member_id is null or nullif(trim(p_title),'') is null or nullif(trim(p_idempotency_key),'') is null then
    return;
  end if;
  if exists (
    select 1 from public.caleris_notification_deletion_tombstones t
    where t.idempotency_key=p_idempotency_key and t.member_id=p_member_id
  ) then return; end if;
  insert into public.caleris_notifications(
    member_id,actor_member_id,category,title,body,href,metadata,idempotency_key
  )
  values(
    p_member_id,p_actor_member_id,p_category,p_title,p_body,p_href,
    coalesce(p_metadata,'{}'::jsonb),p_idempotency_key
  )
  on conflict(idempotency_key) do nothing;
end;
$function$;

create or replace function public.member_delete_caleris_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare v_member_id uuid; v_key text;
begin
  select p.member_id into v_member_id from public.profiles p where p.user_id=(select auth.uid());
  if v_member_id is null then raise exception 'Akun belum terhubung ke member.'; end if;
  select n.idempotency_key into v_key from public.caleris_notifications n
  where n.id=p_notification_id and n.member_id=v_member_id for update;
  if not found then return false; end if;
  insert into public.caleris_notification_deletion_tombstones(idempotency_key,member_id)
  values(v_key,v_member_id) on conflict(idempotency_key) do nothing;
  delete from public.caleris_notifications where id=p_notification_id and member_id=v_member_id;
  return found;
end;
$function$;

create or replace function public.member_delete_caleris_notifications()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_member_id uuid; v_deleted integer:=0;
begin
  select p.member_id into v_member_id from public.profiles p where p.user_id=(select auth.uid());
  if v_member_id is null then raise exception 'Akun belum terhubung ke member.'; end if;
  insert into public.caleris_notification_deletion_tombstones(idempotency_key,member_id)
  select n.idempotency_key,n.member_id from public.caleris_notifications n where n.member_id=v_member_id
  on conflict(idempotency_key) do nothing;
  delete from public.caleris_notifications n where n.member_id=v_member_id;
  get diagnostics v_deleted=row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.enqueue_caleris_notification(uuid,text,text,text,text,text,jsonb,uuid) from public, anon, authenticated, service_role;
revoke all on function public.member_delete_caleris_notification(uuid) from public, anon, service_role;
revoke all on function public.member_delete_caleris_notifications() from public, anon, service_role;
grant execute on function public.member_delete_caleris_notification(uuid) to authenticated;
grant execute on function public.member_delete_caleris_notifications() to authenticated;
