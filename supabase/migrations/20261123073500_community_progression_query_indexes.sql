begin;

create index if not exists caleris_activity_feed_actor_member_id_idx
  on public.caleris_activity_feed(actor_member_id);
create index if not exists caleris_activity_feed_team_id_idx
  on public.caleris_activity_feed(team_id);
create index if not exists caleris_activity_feed_created_id_idx
  on public.caleris_activity_feed(created_at desc,id desc);

create index if not exists caleris_community_polls_created_by_idx
  on public.caleris_community_polls(created_by);
create index if not exists caleris_community_polls_finalized_by_idx
  on public.caleris_community_polls(finalized_by);
create index if not exists caleris_community_polls_cancelled_by_idx
  on public.caleris_community_polls(cancelled_by);
create index if not exists caleris_community_polls_period_id_idx
  on public.caleris_community_polls(period_id);
create index if not exists caleris_community_polls_season_id_idx
  on public.caleris_community_polls(season_id);
create index if not exists caleris_community_polls_status_ends_idx
  on public.caleris_community_polls(status,ends_at);

create index if not exists caleris_community_poll_options_member_id_idx
  on public.caleris_community_poll_options(member_id);
create index if not exists caleris_community_poll_options_team_id_idx
  on public.caleris_community_poll_options(team_id);
create index if not exists caleris_community_votes_option_id_idx
  on public.caleris_community_votes(option_id);

create index if not exists caleris_member_badges_badge_code_idx
  on public.caleris_member_badges(badge_code);
create index if not exists caleris_member_badges_member_awarded_idx
  on public.caleris_member_badges(member_id,awarded_at desc);

create index if not exists caleris_milestone_progress_member_id_idx
  on public.caleris_milestone_progress(member_id);
create index if not exists caleris_milestone_progress_team_id_idx
  on public.caleris_milestone_progress(team_id);

create index if not exists caleris_season_yearbooks_generated_by_idx
  on public.caleris_season_yearbooks(generated_by);
create index if not exists caleris_season_yearbooks_season_id_idx
  on public.caleris_season_yearbooks(season_id);

drop policy if exists "cp polls read" on public.caleris_community_polls;
create policy "cp polls read" on public.caleris_community_polls
for select to authenticated
using(
  status in('scheduled','open','closed','finalized','published','cancelled')
  or created_by=(select auth.uid())
  or exists(select 1 from public.site_admins where user_id=(select auth.uid()))
);

drop policy if exists "cp xp read" on public.caleris_xp_ledger;
create policy "cp xp read" on public.caleris_xp_ledger
for select to authenticated
using(
  member_id=(select public.caleris_current_member_id())
  or exists(select 1 from public.site_admins where user_id=(select auth.uid()))
);

drop policy if exists "cp yearbook owner read" on public.caleris_season_yearbooks;
create policy "cp yearbook owner read" on public.caleris_season_yearbooks
for select to authenticated
using(
  member_id=(select public.caleris_current_member_id())
  or exists(select 1 from public.site_admins where user_id=(select auth.uid()))
);

drop policy if exists "cp member badges read" on public.caleris_member_badges;
create policy "cp member badges read" on public.caleris_member_badges
for select to authenticated
using(
  member_id=(select public.caleris_current_member_id())
  or public.caleris_is_public_digital_id(member_id)
);

drop policy if exists "cp milestone progress read" on public.caleris_milestone_progress;
create policy "cp milestone progress read" on public.caleris_milestone_progress
for select to authenticated
using(
  member_id=(select public.caleris_current_member_id())
  or team_id in(
    select m.team_id from public.members m
    where m.id=(select public.caleris_current_member_id())
  )
);

commit;
