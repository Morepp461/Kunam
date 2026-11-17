create or replace function private.stamp_brand_sponsorship_revision_time()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.created_at:=clock_timestamp();
  return new;
end;
$$;

revoke all on function private.stamp_brand_sponsorship_revision_time() from public,anon,authenticated;

drop trigger if exists caleris_stamp_sponsorship_revision_time on public.caleris_sponsorship_offer_revisions;
create trigger caleris_stamp_sponsorship_revision_time
before insert on public.caleris_sponsorship_offer_revisions
for each row execute function private.stamp_brand_sponsorship_revision_time();
