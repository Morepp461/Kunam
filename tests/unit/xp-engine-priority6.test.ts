import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261126210000_xp_engine_priority6_completion.sql", import.meta.url),
  "utf8",
);
const permanentMilestones = readFileSync(
  new URL("../../supabase/migrations/20261126224000_xp_milestone_rewards_permanent.sql", import.meta.url),
  "utf8",
);
const teamMilestones = readFileSync(
  new URL("../../supabase/migrations/20261126225000_xp_team_milestone_owner_rewards.sql", import.meta.url),
  "utf8",
);
const raceBackfill = readFileSync(
  new URL("../../supabase/migrations/20261126226000_xp_official_result_backfill.sql", import.meta.url),
  "utf8",
);
const adminMigration = readFileSync(
  new URL("../../supabase/migrations/20261126220000_admin_profile_xp_wallet_adjustments.sql", import.meta.url),
  "utf8",
);
const communityUi = readFileSync(
  new URL("../../src/CommunityProgression.tsx", import.meta.url),
  "utf8",
);
const fixedRewardMigration = readFileSync(
  new URL("../../supabase/migrations/20261126227000_lock_xp_rewards_to_source_code.sql", import.meta.url),
  "utf8",
);
const adminUi = readFileSync(
  new URL("../../src/AdminProfileAdjustments.tsx", import.meta.url),
  "utf8",
);

describe("CALERIS XP reward policy", () => {
  it("uses the approved fixed quest and check-in rewards", () => {
    expect(migration).toContain("when 'easy' then 5");
    expect(migration).toContain("when 'normal' then 10");
    expect(migration).toContain("when 'hard' then 15");
    expect(migration).toContain("v_reward:=10");
    expect(migration).toContain("a.reward_status='paid'");
    expect(migration).toContain("a.paid_at is not null");
  });

  it("awards check-in XP from the canonical all-role check-in row", () => {
    expect(migration).toContain("after insert on public.caleris_member_race_checkins");
    expect(migration).toContain("drop trigger if exists caleris_xp_checkin_award on public.license_daily_checkins");
  });

  it("keeps both Development Shop and current Shop XP at zero", () => {
    expect(migration).toContain("drop trigger if exists caleris_xp_shop_award");
    expect(migration).toContain("Shop XP is deliberately zero");
  });

  it("calculates race XP independently from pole position and reconciles corrections", () => {
    expect(migration).toContain("when v_entry.finishing_position=1 then 20");
    expect(migration).toContain("when v_entry.finishing_position=2 then 15");
    expect(migration).toContain("when v_entry.finishing_position=3 then 12");
    expect(migration).toContain("case when v_is_pole then 5 else 0 end");
    expect(migration).toContain("'race_result_correction'");
    expect(migration).toContain("deferrable initially deferred");
    expect(migration).toContain("private.caleris_xp_race_award_state");
  });

  it("keeps milestone rewards fixed, deterministic and non-reversible", () => {
    expect(migration).toContain("public.caleris_milestone_reward_xp(d.code)");
    expect(permanentMilestones).toContain("completion_source:=d.code;");
    expect(permanentMilestones).not.toContain("values(p_member,-net_awarded");
    expect(permanentMilestones).not.toContain("total_xp:=total_xp-net_awarded");
    expect(permanentMilestones).not.toContain("completion_source:=d.code||");
  });
  it("awards team achievements once to the current Team Owner", () => {
    expect(teamMilestones).toContain("when 'team_first_title' then 20");
    expect(teamMilestones).toContain("when 'team_drivers_2' then 5");
    expect(teamMilestones).toContain("private.caleris_team_milestone_xp_awards");
    expect(teamMilestones).toContain("m.role='Owner'");
    expect(teamMilestones).toContain("on conflict(team_id,milestone_id) do nothing");
  });

  it("backfills existing official race results without importing Testing data", () => {
    expect(raceBackfill).toContain("rr.published_at is not null");
    expect(raceBackfill).toContain("private.caleris_reconcile_race_xp(v_round.round_id)");
    expect(raceBackfill).not.toContain("insert into public.members");
  });
});

describe("Admin profile adjustment safeguards", () => {
  it("uses a separate clearing wallet and leaves VreeoBank outside the adjustment route", () => {
    expect(adminMigration).toContain("'admin_adjustment_clearing'");
    expect(adminMigration).toContain("public.caleris_admin_adjust_profile_wallet");
    expect(adminMigration).toContain("p_operation");
    expect(adminMigration).toContain("actor_id");
  });

  it("requires explicit confirmation and uses server-authoritative RPCs", () => {
    expect(adminUi).toContain("caleris_admin_get_profile_adjustment_snapshot");
    expect(adminUi).toContain("caleris_admin_adjust_xp");
    expect(adminUi).toContain("caleris_admin_adjust_profile_wallet");
    expect(adminUi).toContain("window.confirm");
    expect(adminUi).toContain("reason.trim().length<3");
  });
  it("removes Admin XP reward configuration and the duplicate manual XP tool", () => {
    expect(communityUi).not.toContain("caleris_xp_reward_settings");
    expect(communityUi).not.toContain("caleris_set_xp_reward");
    expect(communityUi).not.toContain("Manual XP Adjustment");
    expect(communityUi).not.toContain("XP Reward Configuration");
    expect(communityUi).not.toContain("caleris_admin_adjust_xp");
    expect(fixedRewardMigration).toContain("v_fixed_reward:=public.caleris_milestone_reward_xp(p_code)");
    expect(fixedRewardMigration).toContain("milestone_reward_not_defined_in_source");
    expect(fixedRewardMigration).toContain("revoke all on function public.caleris_set_xp_reward");
  });
});
