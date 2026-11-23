-- Cover foreign-key lookup paths introduced by the CALERIS scope workflows.
create index if not exists caleris_driver_contract_requests_current_contract_fk_idx
  on public.caleris_driver_contract_requests(current_contract_id)
  where current_contract_id is not null;
create index if not exists caleris_driver_contract_requests_renewal_offer_fk_idx
  on public.caleris_driver_contract_requests(renewal_offer_id)
  where renewal_offer_id is not null;
create index if not exists caleris_driver_contract_requests_reviewed_by_fk_idx
  on public.caleris_driver_contract_requests(reviewed_by)
  where reviewed_by is not null;

create index if not exists caleris_team_freeze_settlements_contract_term_fk_idx
  on public.caleris_team_freeze_settlements(contract_term_id)
  where contract_term_id is not null;
create index if not exists caleris_team_freeze_settlements_member_fk_idx
  on public.caleris_team_freeze_settlements(member_id);
create index if not exists caleris_team_freeze_settlements_season_fk_idx
  on public.caleris_team_freeze_settlements(season_id);

create index if not exists caleris_team_inactivity_reviews_team_fk_idx
  on public.caleris_team_inactivity_reviews(team_id);
create index if not exists caleris_team_inactivity_states_frozen_season_fk_idx
  on public.caleris_team_inactivity_states(frozen_after_season_id)
  where frozen_after_season_id is not null;
create index if not exists caleris_team_inactivity_states_last_reviewed_season_fk_idx
  on public.caleris_team_inactivity_states(last_reviewed_season_id)
  where last_reviewed_season_id is not null;

create index if not exists caleris_team_replacement_slots_created_by_fk_idx
  on public.caleris_team_replacement_slots(created_by)
  where created_by is not null;
create index if not exists caleris_team_replacement_slots_replaced_team_fk_idx
  on public.caleris_team_replacement_slots(replaced_team_id);
create index if not exists caleris_team_replacement_slots_replacement_team_fk_idx
  on public.caleris_team_replacement_slots(replacement_team_id)
  where replacement_team_id is not null;

create index if not exists caleris_user_moderation_actions_created_by_fk_idx
  on public.caleris_user_moderation_actions(created_by);
create index if not exists caleris_user_moderation_actions_target_member_fk_idx
  on public.caleris_user_moderation_actions(target_member_id)
  where target_member_id is not null;
