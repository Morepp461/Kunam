begin;

alter table public.caleris_community_polls
  drop constraint if exists caleris_community_polls_status_check;
alter table public.caleris_community_polls
  add constraint caleris_community_polls_status_check
  check(status in('draft','scheduled','open','closed','finalized','published','cancelled'));

alter table public.caleris_community_polls
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id) on delete set null,
  add column if not exists winner_option_ids uuid[] not null default '{}'::uuid[],
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text;

drop policy if exists "cp polls read" on public.caleris_community_polls;
create policy "cp polls read" on public.caleris_community_polls
for select to authenticated
using(status in('scheduled','open','closed','finalized','published','cancelled') or created_by=auth.uid()
  or exists(select 1 from public.site_admins where user_id=auth.uid()));

drop policy if exists "cp options read" on public.caleris_community_poll_options;
create policy "cp options read" on public.caleris_community_poll_options
for select to authenticated
using(exists(select 1 from public.caleris_community_polls p
  where p.id=poll_id and p.status in('scheduled','open','closed','finalized','published','cancelled')));

create or replace function public.caleris_get_community_poll_results(p_poll_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public
as $poll_results$
declare poll public.caleris_community_polls%rowtype; payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id;
  if not found then raise exception 'poll_not_found'; end if;
  if poll.status='cancelled' then raise exception 'poll_cancelled'; end if;
  if poll.status not in('closed','finalized','published') and poll.ends_at>now() then
    raise exception 'poll_results_not_available';
  end if;
  select jsonb_build_object(
    'poll_id',poll.id,
    'status',case when poll.status='open' and poll.ends_at<=now() then 'ended_pending_finalization' else poll.status end,
    'total_votes',(select count(*) from public.caleris_community_votes v where v.poll_id=poll.id),
    'winner_option_ids',to_jsonb(coalesce(poll.winner_option_ids,'{}'::uuid[])),
    'tie_policy','shared_winners',
    'finalized_at',poll.finalized_at,
    'options',coalesce((
      select jsonb_agg(jsonb_build_object(
        'option_id',counts.id,'label',counts.label,'votes',counts.vote_count
      ) order by counts.vote_count desc,counts.label)
      from (
        select o.id,o.label,count(v.id)::integer as vote_count
        from public.caleris_community_poll_options o
        left join public.caleris_community_votes v on v.option_id=o.id
        where o.poll_id=poll.id
        group by o.id,o.label
      ) counts
    ),'[]'::jsonb)
  ) into payload;
  return payload;
end;
$poll_results$;

create or replace function public.caleris_admin_finalize_poll(p_poll_id uuid,p_publish boolean default false)
returns jsonb
language plpgsql security definer set search_path=public
as $finalize_poll$
declare
  poll public.caleris_community_polls%rowtype;
  winners uuid[];
  total_votes bigint;
  top_votes bigint;
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id for update;
  if not found or poll.status in('draft','cancelled') then raise exception 'poll_not_found_or_not_finalizable'; end if;
  if poll.status='published' then return public.caleris_get_community_poll_results(p_poll_id); end if;
  if poll.status='finalized' and not coalesce(p_publish,false) then
    return public.caleris_get_community_poll_results(p_poll_id);
  end if;

  select count(*) into total_votes from public.caleris_community_votes where poll_id=p_poll_id;
  winners:='{}'::uuid[];
  if total_votes>0 then
    select max(vote_count) into top_votes from (
      select count(v.id)::bigint vote_count
      from public.caleris_community_poll_options o
      left join public.caleris_community_votes v on v.option_id=o.id
      where o.poll_id=p_poll_id
      group by o.id
    ) totals;
    select coalesce(array_agg(id order by id),'{}'::uuid[]) into winners
    from (
      select o.id,count(v.id)::bigint vote_count
      from public.caleris_community_poll_options o
      left join public.caleris_community_votes v on v.option_id=o.id
      where o.poll_id=p_poll_id
      group by o.id
    ) totals
    where vote_count=top_votes;
  end if;

  update public.caleris_community_polls
  set status=case when coalesce(p_publish,false) then 'published' else 'finalized' end,
      finalized_at=coalesce(finalized_at,now()),
      finalized_by=coalesce(finalized_by,auth.uid()),
      winner_option_ids=winners
  where id=p_poll_id;

  perform public.caleris_log_activity(
    public.caleris_current_member_id(),null,
    case when coalesce(p_publish,false) then 'community_poll_published' else 'community_poll_finalized' end,
    case when coalesce(p_publish,false) then 'Hasil voting dipublikasikan' else 'Voting difinalisasi' end,
    poll.title,
    jsonb_build_object('source_id','poll-finalized:'||poll.id::text,'poll_id',poll.id,'winner_count',cardinality(winners))
  );
  return public.caleris_get_community_poll_results(p_poll_id);
end;
$finalize_poll$;

create or replace function public.caleris_admin_cancel_poll(p_poll_id uuid,p_reason text default null)
returns void
language plpgsql security definer set search_path=public
as $cancel_poll$
declare poll public.caleris_community_polls%rowtype;
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'not_authorized'; end if;
  select * into poll from public.caleris_community_polls where id=p_poll_id for update;
  if not found or poll.status in('finalized','published','cancelled','draft') then
    raise exception 'poll_not_cancellable';
  end if;
  update public.caleris_community_polls
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
      cancel_reason=left(coalesce(nullif(trim(p_reason),''),'Cancelled by administrator'),500)
  where id=p_poll_id;
  perform public.caleris_log_activity(
    public.caleris_current_member_id(),null,'community_poll_cancelled','Voting dibatalkan',
    poll.title,jsonb_build_object('source_id','poll-cancelled:'||poll.id::text,'poll_id',poll.id)
  );
end;
$cancel_poll$;

revoke all on function public.caleris_get_community_poll_results(uuid) from public,anon;
grant execute on function public.caleris_get_community_poll_results(uuid) to authenticated;
revoke all on function public.caleris_admin_finalize_poll(uuid,boolean) from public,anon;
grant execute on function public.caleris_admin_finalize_poll(uuid,boolean) to authenticated;
revoke all on function public.caleris_admin_cancel_poll(uuid,text) from public,anon;
grant execute on function public.caleris_admin_cancel_poll(uuid,text) to authenticated;

commit;
