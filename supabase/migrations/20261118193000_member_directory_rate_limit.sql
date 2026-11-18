-- Atomic rate limiting for the public member directory.
-- Raw IP addresses are never stored; Edge Function callers provide HMAC-derived bucket keys.
create schema if not exists private;

create table if not exists private.member_directory_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint member_directory_rate_limit_bucket_key_length
    check (pg_catalog.length(bucket_key) between 1 and 160)
);

create index if not exists member_directory_rate_limits_updated_at_idx
  on private.member_directory_rate_limits (updated_at);

alter table private.member_directory_rate_limits enable row level security;
revoke all on table private.member_directory_rate_limits from public, anon, authenticated;

create or replace function public.consume_member_directory_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
  v_retry_after integer;
begin
  if p_bucket_key is null
     or pg_catalog.length(p_bucket_key) < 1
     or pg_catalog.length(p_bucket_key) > 160
     or p_limit is null
     or p_limit < 1
     or p_limit > 10000
     or p_window_seconds is null
     or p_window_seconds < 1
     or p_window_seconds > 86400 then
    raise exception 'Invalid member directory rate limit arguments'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_bucket_key, 0));

  select r.window_started_at, r.request_count
    into v_window_started_at, v_request_count
  from private.member_directory_rate_limits as r
  where r.bucket_key = p_bucket_key
  for update;

  if not found
     or v_window_started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds) then
    insert into private.member_directory_rate_limits (
      bucket_key, window_started_at, request_count, updated_at
    )
    values (p_bucket_key, v_now, 1, v_now)
    on conflict (bucket_key) do update
      set window_started_at = excluded.window_started_at,
          request_count = 1,
          updated_at = excluded.updated_at;
    return query select true, 0;
    return;
  end if;

  if v_request_count >= p_limit then
    v_retry_after := greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from (
          v_window_started_at + pg_catalog.make_interval(secs => p_window_seconds) - v_now
        ))
      )::integer
    );
    update private.member_directory_rate_limits
      set updated_at = v_now
      where bucket_key = p_bucket_key;
    return query select false, v_retry_after;
    return;
  end if;

  update private.member_directory_rate_limits
    set request_count = request_count + 1,
        updated_at = v_now
    where bucket_key = p_bucket_key;

  -- Opportunistic bounded-retention cleanup; the timestamp index keeps this cheap.
  if pg_catalog.random() < 0.01 then
    delete from private.member_directory_rate_limits
    where updated_at < v_now - interval '24 hours';
  end if;

  return query select true, 0;
end;
$function$;

revoke all on function public.consume_member_directory_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_member_directory_rate_limit(text, integer, integer)
  to service_role;

comment on function public.consume_member_directory_rate_limit(text, integer, integer)
  is 'Atomic fixed-window rate limiter for the member-directory Edge Function; service_role only.';
