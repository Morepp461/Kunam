begin;

create table if not exists public.caleris_race_result_drafts (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.license_rounds(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','confirmed','superseded')),
  draft_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_payload)='object'),
  raw_ocr_text text,
  source_image_name text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete restrict,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists caleris_race_result_drafts_one_pending_per_round
  on public.caleris_race_result_drafts(round_id) where status='draft';
create index if not exists caleris_race_result_drafts_round_history_idx
  on public.caleris_race_result_drafts(round_id,updated_at desc);

alter table public.caleris_race_result_drafts enable row level security;
revoke all on public.caleris_race_result_drafts from public,anon,authenticated,service_role;

create or replace function public.fia_save_race_result_draft(
  p_round_id uuid,
  p_draft_payload jsonb,
  p_raw_ocr_text text default null,
  p_source_image_name text default null,
  p_draft_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_round public.license_rounds%rowtype;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat menyimpan draft hasil race.';
  end if;
  if p_round_id is null or jsonb_typeof(p_draft_payload) is distinct from 'object'
     or jsonb_typeof(p_draft_payload->'entries') is distinct from 'array' then
    raise exception 'Round dan payload draft klasifikasi wajib valid.';
  end if;
  select * into v_round from public.license_rounds where id=p_round_id for update;
  if not found or v_round.status='closed' then
    raise exception 'Round tidak tersedia atau sudah ditutup.';
  end if;

  if p_draft_id is not null then
    select id into v_id from public.caleris_race_result_drafts
      where id=p_draft_id and round_id=p_round_id and status='draft' for update;
    if v_id is null then raise exception 'Draft tidak ditemukan atau sudah dikonfirmasi.'; end if;
  else
    select id into v_id from public.caleris_race_result_drafts
      where round_id=p_round_id and status='draft' for update;
  end if;

  if v_id is null then
    insert into public.caleris_race_result_drafts(round_id,draft_payload,raw_ocr_text,source_image_name,created_by,updated_by)
    values(p_round_id,p_draft_payload,left(p_raw_ocr_text,100000),nullif(left(trim(p_source_image_name),255),''),(select auth.uid()),(select auth.uid()))
    returning id into v_id;
  else
    update public.caleris_race_result_drafts
    set draft_payload=p_draft_payload,
        raw_ocr_text=left(p_raw_ocr_text,100000),
        source_image_name=nullif(left(trim(p_source_image_name),255),''),
        updated_by=(select auth.uid()),
        updated_at=now()
    where id=v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.fia_get_race_result_draft(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat membaca draft hasil race.';
  end if;
  select jsonb_build_object(
    'id',id,'draft_payload',draft_payload,'raw_ocr_text',raw_ocr_text,
    'source_image_name',source_image_name,'updated_at',updated_at
  ) into v_result
  from public.caleris_race_result_drafts
  where round_id=p_round_id and status='draft'
  order by updated_at desc limit 1;
  return v_result;
end;
$$;

create or replace function public.fia_confirm_race_result_draft(
  p_draft_id uuid,
  p_round_id uuid,
  p_draft_payload jsonb,
  p_entries jsonb,
  p_driver_of_day_member_id uuid,
  p_pole_time_ms integer,
  p_circuit_name text,
  p_circuit_country_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_draft public.caleris_race_result_drafts%rowtype;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat mengonfirmasi hasil race.';
  end if;
  if jsonb_typeof(p_draft_payload) is distinct from 'object' then
    raise exception 'Payload revisi hasil race tidak valid.';
  end if;
  select * into v_draft from public.caleris_race_result_drafts
    where id=p_draft_id and round_id=p_round_id and status='draft' for update;
  if not found then raise exception 'Draft tidak ditemukan atau sudah dikonfirmasi.'; end if;

  v_result:=public.fia_submit_race_classification_v2(
    p_round_id,p_entries,p_driver_of_day_member_id,p_pole_time_ms,p_circuit_name,p_circuit_country_code
  );

  update public.caleris_race_result_drafts
  set status='confirmed',draft_payload=p_draft_payload,
      reviewed_by=(select auth.uid()),updated_by=(select auth.uid()),
      confirmed_at=now(),updated_at=now()
  where id=p_draft_id;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'draft_id',p_draft_id,'draft_status','confirmed','reviewed_by',(select auth.uid())
  );
end;
$$;

revoke all on function public.fia_save_race_result_draft(uuid,jsonb,text,text,uuid) from public,anon,service_role;
revoke all on function public.fia_get_race_result_draft(uuid) from public,anon,service_role;
revoke all on function public.fia_confirm_race_result_draft(uuid,uuid,jsonb,jsonb,uuid,integer,text,text) from public,anon,service_role;
grant execute on function public.fia_save_race_result_draft(uuid,jsonb,text,text,uuid) to authenticated;
grant execute on function public.fia_get_race_result_draft(uuid) to authenticated;
grant execute on function public.fia_confirm_race_result_draft(uuid,uuid,jsonb,jsonb,uuid,integer,text,text) to authenticated;

commit;
