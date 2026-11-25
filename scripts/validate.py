from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def main():
    required = [
        "package.json", "index.html", "vite.config.ts", "src/main.tsx",
        "src/App.tsx", "src/MainLayout.tsx", "src/DashboardModule.tsx", "src/ProfileModule.tsx", "src/lib/stage5QueryPlan.ts", "src/styles.css", "src/lib/supabase.ts",
        "src/vite-env.d.ts", "supabase/SETUP.sql",
        "assets/Background 2.png",
        "assets/Untitled design_20261103_142659_0000.png",
        "assets/Add a heading_20260907_003952_0000.png",
    ]
    for item in required:
        path = ROOT / item
        assert path.is_file() and path.stat().st_size > 0, f"Missing required file: {item}"
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert package["scripts"]["build"] == "tsc -b && vite build"
    vite_config = (ROOT / "vite.config.ts").read_text(encoding="utf-8")
    assert "copy-caleris-static-assets" in vite_config and "cpSync(source, destination" in vite_config
    history_aligned_migrations = [
        "20261112092221_split_public_content_rls_admin_lookup.sql",
        "20261112093246_grant_search_service_role_select.sql",
        "20261112123648_license_scoring_engine.sql",
        "20261112123731_license_wdc_finalization_validation.sql",
        "20261112123814_license_driver_read_policies_and_milestone_validation.sql",
        "20261112124122_license_round_processing_order.sql",
        "20261112124242_license_offseason_hiatus_guard.sql",
        "20261112125157_race_day_checkin_and_lifetime_wdc.sql",
        "20261112130133_wdc_highest_division_dynamic_points.sql",
        "20261113055303_stage5_panel_operations.sql",
        "20261113055514_stage5_season_catalog_read.sql",
        "20261113055712_stage5_race_classification_rpc.sql",
        "20261113055954_stage5_regulation_announcement_sync.sql",
        "20261113060112_stage5_rpc_invoker_security.sql",
        "20261113060125_stage5_team_roster_rls_guard.sql",
        "20261113060333_stage5_calendar_policy_cleanup.sql",
    ]
    for migration in history_aligned_migrations:
        assert (ROOT / "supabase/migrations" / migration).is_file(), f"Missing Supabase-history-aligned migration: {migration}"
    development_cash_migration = ROOT / "supabase/migrations/20261116232000_cash_based_development_economy.sql"
    assert development_cash_migration.is_file(), "Missing cash-based Development migration"
    for obsolete in ["20261112110000_split_public_content_rls_admin_lookup.sql", "20261112123000_grant_search_service_role_select.sql", "20261112150000_license_scoring_engine.sql", "20261112151000_license_wdc_finalization_validation.sql", "20261112152000_license_driver_read_policies_and_milestone_validation.sql", "20261112153000_license_round_processing_order.sql", "20261112154000_license_offseason_hiatus_guard.sql", "20261112155000_race_day_checkin_and_lifetime_wdc.sql", "20261112160000_wdc_highest_division_dynamic_points.sql", "20261112170000_season_calendar_and_payroll.sql"]:
        assert not (ROOT / "supabase/migrations" / obsolete).exists(), f"Obsolete migration version remains: {obsolete}"
    economy_gateway_migration = ROOT / "supabase/migrations/20261112140121_economy_edge_gateway.sql"
    economy_edge_function = ROOT / "supabase/functions/economy-engine/index.ts"
    assert economy_gateway_migration.is_file() and economy_edge_function.is_file(), "Missing Economy Engine gateway hardening"
    gateway_sql = economy_gateway_migration.read_text(encoding="utf-8")
    assert "to service_role" in gateway_sql and "from public,anon,authenticated,service_role" in gateway_sql
    edge_source = economy_edge_function.read_text(encoding="utf-8")
    assert "auth.getUser(jwt)" in edge_source and 'from("site_admins")' in edge_source
    assert "Number(amount.toFixed(2)) !== amount" in edge_source
    assert 'serviceClient.rpc("admin_post_economy_transaction"' in edge_source
    assert 'serviceClient.rpc("admin_reverse_economy_transaction"' in edge_source
    assert 'serviceClient.rpc("admin_process_pending_economy_rewards"' in edge_source
    economy_query_migration = ROOT / "supabase/migrations/20261112140208_economy_engine_query_hardening.sql"
    assert economy_query_migration.is_file(), "Missing Economy Engine query hardening migration"
    query_sql = economy_query_migration.read_text(encoding="utf-8")
    query_history_duplicate = ROOT / "supabase/migrations/20261112140552_economy_engine_query_hardening.sql"
    assert query_history_duplicate.is_file(), "Missing second recorded Economy query migration version"
    assert query_history_duplicate.read_text(encoding="utf-8") == query_sql, "Economy query migration history copies differ"
    for fragment in ["economy_transactions_created_by_idx", "economy_reward_claims_member_idx", "economy_reward_claims_source_idx", "Members and admins read economy wallets"]:
        assert fragment in query_sql, f"Economy query hardening missing: {fragment}"
    stage5 = (ROOT / "src/Stage5Panel.tsx").read_text(encoding="utf-8")
    stage5_css = (ROOT / "src/stage5-panel.css").read_text(encoding="utf-8")
    for fragment in ["driver-panel", "career-history", "financial-centre", "team-summary", "driver-registration", "place-job-advert", "caleris_announcements", "caleris_regulations", "caleris_appeals", "Engine Ranking", "Rookie of the Season", "fia_publish_regulation"]:
        assert fragment in stage5, f"Stage 5 panel missing: {fragment}"
    invoker_sql = (ROOT / "supabase/migrations/20261113060112_stage5_rpc_invoker_security.sql").read_text(encoding="utf-8")
    for function_name in ["member_register_driver_for_season", "fia_decide_appeal", "fia_publish_regulation", "fia_record_race_result_entry"]:
        assert f"function public.{function_name}" in invoker_sql and "security invoker" in invoker_sql, f"Missing invoker-secured RPC: {function_name}"
    for fragment in [".s5-workspace", ".s5-table", ".s5-hero", ".s5-main-tabs"]:
        assert fragment in stage5_css, f"Stage 5 styles missing: {fragment}"
    app = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
    profile_module = (ROOT / "src/ProfileModule.tsx").read_text(encoding="utf-8")
    dashboard_module = (ROOT / "src/DashboardModule.tsx").read_text(encoding="utf-8")
    layout_module = (ROOT / "src/MainLayout.tsx").read_text(encoding="utf-8")
    character_identity_migration = ROOT / "supabase/migrations/20261118140000_permanent_character_wallet_and_identity.sql"
    character_balance_migration = ROOT / "supabase/migrations/20261118150000_character_balance_aggregate_preserve_wallet_history.sql"
    assert character_identity_migration.is_file() and character_balance_migration.is_file(), "Missing permanent character identity/balance migrations"
    identity_sql = character_identity_migration.read_text(encoding="utf-8")
    balance_sql = character_balance_migration.read_text(encoding="utf-8")
    for fragment in ["guard_permanent_profile_character", "profiles_permanent_character_link"]:
        assert fragment in identity_sql, f"Permanent character identity migration missing: {fragment}"
    for fragment in ["drop trigger if exists zz_members_character_wallet_sync", "drop trigger if exists zz_profiles_character_wallet_sync", "drop function if exists private.consolidate_member_character_wallets"]:
        assert fragment in balance_sql, f"Character balance compatibility migration missing: {fragment}"
    assert 'nextWallets.public_member=Number(publicWallet?.balance||0)+Number(nextWallets.driver||0)+Number(nextWallets.team_owner||0)' in profile_module, "Profile must aggregate all personal wallet buckets into the character balance"
    assert 'const characterWallet=wallets.public_member' in profile_module, "Account and character balance must use the same aggregate"
    assert 'const balance=(roleWallets||[]).reduce((sum:number,row:any)=>sum+Number(row.balance||0),0)+Number(publicWallet?.balance||0)' in dashboard_module, "Dashboard must display the same aggregate character balance"
    assert 'path="/profile"' in app
    assert 'const Stage5Panel = lazy(() => import("./Stage5Panel"));' in app, "Stage 5 must remain available through its lazy route boundary"
    assert 'path="/fia-panel/license-engine" element={isAdmin?' in app
    assert 'path="/admin/license-engine" element={session&&!needsPaddockAccess&&isAdmin?' in app
    styles = (ROOT / "src/styles.css").read_text(encoding="utf-8")
    sql = (ROOT / "supabase/SETUP.sql").read_text(encoding="utf-8")
    assert 'provider:"discord"' in app
    assert '<div className="scene" aria-hidden="true"><img className="scene-image" src="/assets/Background%203.png" alt=""/>' in layout_module
    assert "data-member=" not in app
    assert '"/rules"' in app or 'path="/rules"' in app
    assert 'path="/privacy-policy"' in app and 'path="/terms-and-conditions"' in app
    assert 'COMMUNITY &amp; SUPPORT' in layout_module and 'Dukung Vreeo · Socialbuzz' in layout_module
    assert 'DIRECTOR OF VREEO.ID' in layout_module
    for director, instagram in [
        ("Muhammad Ovella", "lllllaaaaa44444"),
        ("Agung Pradana", "pradana.3"),
        ("Muhammad Alfarel", "alfredo_owenzaus"),
        ("Liam Amir", "liam_amir26"),
        ("Suhanda Arbawi", "_suhanda08"),
    ]:
        assert director in layout_module and instagram in layout_module, f"Missing director link: {director}"
    assert 'footer-directors nav' in styles
    assert 'Gabung Discord' in (app + layout_module) and 'Official Partners' not in (app + layout_module)
    assert 'CALERIS MASTERS · POWERED BY VREEO' in layout_module
    assert 'A Motorsport Roleplay Experience' not in (app + layout_module)
    assert 'footer-main' in styles and 'footer-support nav' in styles
    assert 'DIRECTOR OF VREEO.ID' in layout_module
    for director in ["Muhammad Ovella", "Agung Pradana", "Muhammad Alfarel", "Liam Amir", "Suhanda Arbawi"]:
        assert director in layout_module
    assert 'footer-directors nav' in styles
    assert 'path="/privacy-policy" element={<PrivacyPolicy/>}' in app
    assert 'path="/terms-and-conditions" element={<TermsAndConditions/>}' in app
    privacy_page = (ROOT / "src/PrivacyPolicy.tsx").read_text(encoding="utf-8")
    terms_page = (ROOT / "src/TermsAndConditions.tsx").read_text(encoding="utf-8")
    assert "Kebijakan Privasi" in privacy_page and "Data yang Kami Kumpulkan" in privacy_page
    assert "Syarat & Ketentuan" in terms_page and "Persetujuan dan Ruang Lingkup" in terms_page
    assert 'legal-blank-page' not in app
    assert "site_admins" in app and "site_content" in app and "site_settings" in app
    assert "if(term.length<1)" in app
    assert "query.trim().length>=1" in app
    assert 'import {createPortal} from "react-dom"' in app
    assert "searchRootRef" in app and "document.body" in app
    assert "dropdownStyle.maxHeight" in app
    rls_fix = ROOT / "supabase/migrations/20261112092221_split_public_content_rls_admin_lookup.sql"
    assert rls_fix.is_file(), "Missing public RLS split migration"
    rls_source = rls_fix.read_text(encoding="utf-8")
    assert "TO anon, authenticated" in rls_source
    assert "TO authenticated" in rls_source
    assert '"Public can read community setting"' in rls_source
    assert '"Admins read all site settings"' in rls_source
    assert '"Public can read published content"' in rls_source
    assert '"Admins read all site content"' in rls_source
    assert "},100);return()=>{active=false;window.clearTimeout(timer)}" in app
    permissions_migration = ROOT / "supabase/migrations/20261112093246_grant_search_service_role_select.sql"
    assert permissions_migration.is_file(), "Missing search service-role grants migration"
    permissions_sql = permissions_migration.read_text(encoding="utf-8").lower()
    assert "grant select on table" in permissions_sql
    for table in ["public.profiles", "public.members", "public.teams", "public.site_admins", "public.site_content"]:
        assert table in permissions_sql
    assert "to service_role" in permissions_sql
    assert "to anon" not in permissions_sql and "to authenticated" not in permissions_sql
    assert "tire-trace" in app and "toast-stack" in app and "global-progress" in styles
    assert "cinematicCamera" in styles and "spotlightSweep" in styles
    assert "enable row level security" in sql.lower()
    assert "create policy" in sql.lower()
    assert "Paddock Access" in app and "complete-paddock-access" in app
    paddock_function = (ROOT / "supabase/functions/complete-paddock-access/index.ts").read_text(encoding="utf-8").lower()
    assert "turnstile" not in app.lower() and "cloudflare" not in app.lower()
    assert "turnstile" not in paddock_function and "cloudflare" not in paddock_function
    assert "onboarding_completed" in app and "preferredRole" in app
    search = ROOT / "supabase/functions/member-directory/index.ts"
    assert search.is_file(), "Missing member directory search function"
    search_source = search.read_text(encoding="utf-8")
    assert 'action === "search"' in search_source
    assert "if (term.length < 1)" in search_source
    assert r'raw.replace(/[^\p{L}\p{N} _-]/gu' in search_source
    assert r'.replace(/\s+/g, " ")' in search_source
    assert '.in("account_status", ["public", "active", "admin"])' in search_source
    assert 'admin.from("teams").select("id,name").ilike("name", pattern)' in search_source
    assert 'return respond(200, { members, teams, pages })' in search_source
    assert 'requestHeaders.delete("Authorization")' in search_source
    assert 'requestHeaders.set("apikey", serviceKey)' in search_source
    for card_title in ["Current Event", "Statistik", "Informasi akun", "Informasi karakter", "Detail kontrak"]:
        assert card_title in app, f"Global search card header missing: {card_title}"
    edge = ROOT / "supabase/functions/complete-paddock-access/index.ts"
    assert edge.is_file() and "turnstile" not in edge.read_text(encoding="utf-8").lower() and "cloudflare" not in edge.read_text(encoding="utf-8").lower()
    economy_migration = ROOT / "supabase/migrations/20261112135818_economy_engine_core.sql"
    assert economy_migration.is_file(), "Missing Economy Engine migration"
    economy_sql = economy_migration.read_text(encoding="utf-8")
    for fragment in [
        "public.economy_wallet_accounts", "public.economy_transactions",
        "public.economy_entries", "public.economy_reward_claims",
        "private.post_economy_transaction", "pg_advisory_xact_lock",
        "admin_post_economy_transaction", "admin_reverse_economy_transaction",
        "admin_process_pending_economy_rewards", "economy_daily_checkin_reward",
        "source_account_id", "destination_account_id", "idempotency_key",
        "security_invoker=true", "VreeoBank", "Sponsor Source",
    ]:
        assert fragment in economy_sql, f"Economy Engine migration missing: {fragment}"
    assert "p_event_type not in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal')" in economy_sql
    assert "p_event_type not in ('tax','fine')" in economy_sql
    assert "v_destination.account_kind<>'vreeo_bank' or v_source.account_kind in ('vreeo_bank','sponsor_source')" in economy_sql
    economy_component = ROOT / "src/AdminEconomyEngine.tsx"
    economy_styles = ROOT / "src/economy-engine.css"
    assert economy_component.is_file() and economy_styles.is_file(), "Missing Economy Engine UI"
    economy_source = economy_component.read_text(encoding="utf-8")
    assert "Number(numericAmount.toFixed(2)) !== numericAmount" in economy_source
    assert 'supabase.functions.invoke("economy-engine"' in economy_source
    assert 'supabase.rpc("admin_post_economy_transaction"' not in economy_source
    assert 'supabase.rpc("admin_reverse_economy_transaction"' not in economy_source
    assert 'supabase.rpc("admin_process_pending_economy_rewards"' not in economy_source
    for rpc in ["admin_post_economy_transaction", "admin_reverse_economy_transaction", "admin_process_pending_economy_rewards"]:
        assert rpc in edge_source, f"Economy Edge gateway missing RPC: {rpc}"
    app = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
    assert 'path="/admin/economy-engine"' in app and 'label:"Economy Engine"' in layout_module
    assert 'const AdminEconomyEngine = lazy(() => import("./AdminEconomyEngine"));' in app and 'from("economy_wallet_directory")' in profile_module
    assert 'select("id,member_code,character_name,role,license,team_id,balance")' not in profile_module
    calendar_migration = ROOT / "supabase/migrations/20261112160305_season_calendar_and_payroll.sql"
    calendar_component = ROOT / "src/AdminSeasonCalendar.tsx"
    contracts_component = ROOT / "src/TeamDriverContracts.tsx"
    assert calendar_migration.is_file() and calendar_component.is_file() and contracts_component.is_file(), "Missing season calendar/payroll implementation"
    calendar_sql = calendar_migration.read_text(encoding="utf-8")
    calendar_source = calendar_component.read_text(encoding="utf-8")
    contracts_source = contracts_component.read_text(encoding="utf-8")
    for fragment in ["season_calendar_periods", "season_period_rounds", "economy_driver_contracts", "economy_payroll_claims", "fia_create_season_calendar", "payroll_for_period_round", "admin_process_pending_economy_payroll", "is_caleris_fia_or_admin"]:
        assert fragment in calendar_sql, f"Season calendar/payroll migration missing: {fragment}"
    for fragment in ["Off Season", "Pre Season", "Race Period", "Break Balancing", "End Season", "Reschedule", "fia_reschedule_season_calendar", "12 periode"]:
        assert fragment in calendar_source, f"Automated Season Calendar UI missing: {fragment}"
    assert "annual_salary" in contracts_source and "economy_driver_contracts" in contracts_source

    quest_page = ROOT / "src/QuestPage.tsx"
    quest_admin = ROOT / "src/AdminQuestEngine.tsx"
    quest_styles = ROOT / "src/quest-engine.css"
    quest_admin_styles = ROOT / "src/admin-quest-engine.css"
    quest_migrations = sorted((ROOT / "supabase/migrations").glob("*_quest_*.sql"))
    assert quest_page.is_file() and quest_admin.is_file() and quest_styles.is_file() and quest_admin_styles.is_file(), "Missing Quest Engine UI"
    assert len(quest_migrations) >= 7, "Missing Quest Engine database migrations"
    quest_source = quest_page.read_text(encoding="utf-8")
    quest_admin_source = quest_admin.read_text(encoding="utf-8")
    quest_sql = "\\n".join(path.read_text(encoding="utf-8") for path in quest_migrations)
    for fragment in ["member_get_quest_board", "member_claim_quest_reward", "Daily Quest", "Period Quest", "reward_status", "VreeoBank", "Driver Wallet", "Team Owner Wallet", "Klaim Reward", "wallet pribadi"]:
        assert fragment in quest_source, f"Quest board missing: {fragment}"
    for fragment in ["admin_update_quest_reward_amounts", "Nominal berdasarkan kesulitan"]:
        assert fragment in quest_admin_source, f"Quest Admin missing: {fragment}"
    for fragment in ["caleris_quest_catalog", "caleris_quest_assignments", "caleris_quest_difficulty_rewards", "member_get_quest_board", "member_claim_quest_reward", "admin_update_quest_reward_amounts", "bank_reward", "account_kind='driver'", "account_kind='team_owner'", "const sequence="]:
        assert fragment in quest_sql or fragment in calendar_source, f"Quest Engine migration missing: {fragment}"
    assert "admin_process_pending_quest_rewards" not in quest_admin_source, "Admin Quest Engine must not pay unclaimed member rewards"
    assert 'path="/driver-panel/quest"' in app and 'path="/team-panel/quest"' in app and 'path="/admin/quest-engine"' in app
    assert "Quest Engine" in (ROOT / "README.md").read_text(encoding="utf-8")
    assert "payroll" in edge_source and "process_payroll_pending" in edge_source
    assert 'path="/fia-panel/season-calendar"' in app and 'path="/fia-panel/license-engine"' in app and 'path="/team-panel/driver-contracts"' in app
    assert 'const FIAEventControlCenter = lazy(() => import("./FIAEventControlCenter"));' in app and 'const TeamDriverContracts = lazy(() => import("./TeamDriverContracts"));' in app
    license_engine_source = (ROOT / "src/AdminLicenseEngine.tsx").read_text(encoding="utf-8")
    assert "CALERIS MASTERS · FIA AUTOMATION" in license_engine_source and "fia_create_caleris_season" in license_engine_source
    assert 'fia_panel:admin||memberRole==="FIA"' in app, "FIA panel access must remain available to FIA and Admin"
    assert 'path="/fia-panel/license-engine" element={isAdmin?' in app and 'to:"/admin/license-engine"' in layout_module, "License Scoring Engine must be Admin-only"

    cash_loan_migration = ROOT / "supabase/migrations/20261112173057_economy_cash_loan_engine.sql"
    cash_loan_component = ROOT / "src/CashLoanCentre.tsx"
    cash_loan_styles = ROOT / "src/cash-loan.css"
    cash_loan_indexes = ROOT / "supabase/migrations/20261112173427_economy_cash_loan_indexes.sql"
    cash_loan_edge = ROOT / "supabase/functions/economy-workflows/index.ts"
    assert cash_loan_migration.is_file() and cash_loan_indexes.is_file() and cash_loan_component.is_file() and cash_loan_styles.is_file() and cash_loan_edge.is_file(), "Missing Cash Loan Engine files"
    cash_loan_sql = cash_loan_migration.read_text(encoding="utf-8")
    for fragment in ["economy_cash_loan_interest_rates", "economy_cash_loans", "economy_cash_loan_installments", "member_cash_loan_preview", "member_apply_cash_loan", "process_cash_loan_repayments", "loan_disbursement", "loan_repayment", "values(1,5),(2,10),(3,16),(4,24)"]:
        assert fragment in cash_loan_sql, f"Cash Loan migration missing: {fragment}"
    index_sql = cash_loan_indexes.read_text(encoding="utf-8")
    for fragment in ["economy_cash_loans_profile_user_idx", "economy_cash_loans_wallet_idx", "economy_cash_loans_origin_season_idx", "economy_cash_loan_installments_season_idx", "economy_cash_loan_installments_period_idx"]:
        assert fragment in index_sql, f"Cash Loan index migration missing: {fragment}"
    cash_loan_source = cash_loan_component.read_text(encoding="utf-8")
    for fragment in ["cash_loan_preview", "apply_cash_loan", "interest_rates", "has_open_loan", "race_period_count", "total_interest_rate"]:
        assert fragment in cash_loan_source, f"Cash Loan UI missing: {fragment}"
    cash_loan_gateway = cash_loan_edge.read_text(encoding="utf-8")
    assert "auth.getUser(jwt)" in cash_loan_gateway and '["cash_loan_preview","apply_cash_loan","team_cash_loan_preview","apply_team_cash_loan"].includes(action)' in cash_loan_gateway and "return respond(410" in cash_loan_gateway
    assert 'path="/financial-centre"' in app and 'const CashLoanCentre = lazy(() => import("./CashLoanCentre"));' not in app
    race_control = ROOT / "src/RaceControl.tsx"
    race_styles = ROOT / "src/race-control.css"
    race_migration = ROOT / "supabase/migrations/20261116160000_automated_race_control_economy.sql"
    assert race_control.is_file() and race_styles.is_file() and race_migration.is_file(), "Missing automated race control implementation"
    race_source = race_control.read_text(encoding="utf-8")
    race_sql = race_migration.read_text(encoding="utf-8")
    for fragment in ["grid_position", "finish_time_ms", "fastest_lap_ms", "driver_of_day_member_id", "race-stint-dots", "fia_submit_race_classification"]:
        assert fragment in race_source or fragment in race_sql, f"Race Control missing: {fragment}"
    for fragment in ["caleris_race_stints", "caleris_race_points_rules", "process_license_round", "payout_season_prizepool", "fia_record_race_result("]:
        assert fragment in race_sql, f"Automated race settlement missing: {fragment}"
    assert 'path="/fia-panel/race-input"' in app and 'import RaceControl from "./RaceControl";' in (ROOT / "src/FIAEventControlCenter.tsx").read_text(encoding="utf-8")
    assert 'path: "race-input", label: "Race Input"' in (ROOT / "src/PanelPages.tsx").read_text(encoding="utf-8")


    retry_migration = ROOT / "supabase/migrations/20261116170000_economy_retry_and_audit_center.sql"
    retry_ui = ROOT / "src/AdminEconomyAudit.tsx"
    assert retry_migration.is_file() and retry_ui.is_file(), "Missing Economy Retry and Audit Center"
    retry_sql = retry_migration.read_text(encoding="utf-8")
    retry_source = retry_ui.read_text(encoding="utf-8")
    for fragment in ["retry_pending_economy_rewards", "caleris_economy_retry_runs", "admin_get_economy_audit_snapshot", "caleris-economy-pending-retry"]:
        assert fragment in retry_sql, f"Economy retry migration missing: {fragment}"
    for fragment in ["pending_payroll", "recent_runs", "pending_items", "Automated Payroll Preparation", "payroll_pending"]:
        assert fragment in retry_source, f"Economy Audit Center missing: {fragment}"
    assert "admin_get_economy_audit_snapshot" in retry_source
    assert "process_license_round" not in retry_sql, "Payroll must remain tied to round processing, not a scheduler."

    role_lifecycle = ROOT / "supabase/migrations/20261116230000_member_role_lifecycle_and_fia_invites.sql"
    assert role_lifecycle.is_file(), "Missing member role lifecycle migration"
    role_sql = role_lifecycle.read_text(encoding="utf-8")
    for fragment in ["release_driver_role_after_contract_end", "economy_driver_contracts", "status='ended'", "admin_invite_member_to_fia", "site_admins", "role='FIA'", "status='loan_active'", "status='cancelled'"]:
        assert fragment in role_sql, f"Member role lifecycle migration missing: {fragment}"
    takeover_sql = (ROOT / "supabase/migrations/20261113040857_team_takeover_driver_contract_closeout.sql").read_text(encoding="utf-8")
    assert "update public.members set role=null,team_id=null where id=v_seller.id" in takeover_sql, "Team Take Over must release the former Owner role"
    assert 'panelAccess.member_role===null' in app and 'path="/main-event/registration"' in app, "Main Event Registration must be limited to members without an active role"
    assert 'admin_invite_member_to_fia' in app and 'Invite menjadi anggota FIA' in app and 'site_admins' in app, "Admin FIA invitation must be present on member profiles"
    development_hardening = ROOT / "supabase/migrations/20261116231000_development_snapshot_index_and_seed_trigger_security.sql"
    assert development_hardening.is_file(), "Missing development database hardening migration"
    hardening_sql = development_hardening.read_text(encoding="utf-8")
    assert "caleris_development_season_snapshots_season_idx" in hardening_sql
    assert "revoke all on function public.seed_team_development_parts()" in hardening_sql
    season_roster_migration = ROOT / "supabase/migrations/20261118170000_season_roster_contract_snapshots.sql"
    season_roster_validation = ROOT / "supabase/migrations/20261118170500_season_roster_calendar_validation.sql"
    season_contract_expiry = ROOT / "supabase/migrations/20261118171000_season_contract_expiry_on_end.sql"
    license_engine = (ROOT / "src/AdminLicenseEngine.tsx").read_text(encoding="utf-8")
    stage5_panel = (ROOT / "src/Stage5Panel.tsx").read_text(encoding="utf-8")
    assert season_roster_migration.is_file() and season_roster_validation.is_file() and season_contract_expiry.is_file(), "Missing contract-backed season roster lifecycle migrations"
    roster_sql = season_roster_migration.read_text(encoding="utf-8")
    validation_sql = season_roster_validation.read_text(encoding="utf-8")
    expiry_sql = season_contract_expiry.read_text(encoding="utf-8")
    for fragment in ["license_season_roster_snapshots", "license_season_team_snapshots", "economy_driver_contracts", "c.status='active'", "private.season_driver_effective_team", "approved_waiting_window", "license_round_standings", "driver_name_snapshot", "team_name_snapshot", "private.process_season_lifecycle"]:
        assert fragment in roster_sql, f"Season roster lifecycle missing: {fragment}"
    for fragment in ["calendar_period_sequence_invalid", "calendar_dates_not_contiguous", "race_period_round_count_invalid", "division_has_no_active_contracted_drivers"]:
        assert fragment in validation_sql, f"Season activation validation missing: {fragment}"
    assert "delete from public.license_round_standings" not in roster_sql.lower()
    assert "delete from public.license_final_standings" not in roster_sql.lower()
    assert "delete from public.license_team_final_standings" not in roster_sql.lower()
    assert "fia_create_caleris_season" in license_engine and "CALERIS PREMIO" in license_engine and "CALERIS ZWEI" in license_engine
    assert "ended_contracts" in expiry_sql and "set status='ended'" in expiry_sql and "contracts_ended" in expiry_sql
    assert "driver_name_snapshot" in stage5_panel and "team_name_snapshot" in stage5_panel and "r.team_name_snapshot" in stage5_panel
    recruitment_migration = ROOT / "supabase/migrations/20261118190000_license_salary_and_team_recruitment_workflows.sql"
    recruitment_market = ROOT / "src/DriverTransferMarket.tsx"
    recruitment_contracts = ROOT / "src/TeamDriverContracts.tsx"
    recruitment_registration = ROOT / "src/TeamDriverApplications.tsx"
    recruitment_advert = ROOT / "src/TeamJobAdvert.tsx"
    panel_pages = ROOT / "src/PanelPages.tsx"
    assert all(path.is_file() for path in [recruitment_migration,recruitment_market,recruitment_contracts,recruitment_registration,recruitment_advert]), "Missing license salary and recruitment workflow files"
    recruitment_sql = recruitment_migration.read_text(encoding="utf-8")
    recruitment_market_source = recruitment_market.read_text(encoding="utf-8")
    recruitment_contract_source = recruitment_contracts.read_text(encoding="utf-8")
    recruitment_registration_source = recruitment_registration.read_text(encoding="utf-8")
    recruitment_advert_source = recruitment_advert.read_text(encoding="utf-8")
    for fragment in ["caleris_driver_salary_bands", "5000000", "7500000", "7600000", "12000000", "12100000", "22500000", "22600000", "45000000", "member_start_free_agent_contract_negotiation", "member_respond_free_agent_contract_negotiation", "team_register_driver_to_fia", "pending_registration", "guard_caleris_job_advert", "revoke all on function public.member_sign_free_agent"]:
        assert fragment in recruitment_sql, f"Recruitment migration missing: {fragment}"
    for fragment in ["member_start_free_agent_contract_negotiation", "member_respond_free_agent_contract_negotiation", "FREE AGENT CONTRACT DESK", "Transfer Window"]:
        assert fragment in recruitment_market_source, f"Free Agent negotiation UI missing: {fragment}"
    for fragment in ["AGREED CONTRACTS", "pending_registration", "economy_driver_contracts"]:
        assert fragment in recruitment_contract_source, f"Read-only Driver Contracts UI missing: {fragment}"
    for fragment in ["team_register_driver_to_fia", "FIA ROSTER SUBMISSION", "license_season_members"]:
        assert fragment in recruitment_registration_source, f"FIA roster registration UI missing: {fragment}"
    for fragment in ["caleris_driver_salary_bands", "minimum_license", "salary_min", "salary_max", "member.team_id", "position"]:
        assert fragment in recruitment_advert_source, f"Team-scoped Job Advert UI missing: {fragment}"
    assert 'if(tab.path==="place-job-advert")return <TeamJobAdvert/>' in panel_pages.read_text(encoding="utf-8")
    assert "panelTabIcons[group.path+\"/\"+tab.path]" in layout_module, "Panel navigation must use distinct per-tab icons"
    assert "Fixed Driver License Salary Bands" in (ROOT / "README.md").read_text(encoding="utf-8")
    contract_lock_fix = ROOT / "supabase/migrations/20261118190500_contract_salary_lock_lifecycle_fix.sql"
    roster_registration_fix = ROOT / "supabase/migrations/20261118191000_fix_active_season_roster_registration.sql"
    owner_negotiation_fix = ROOT / "supabase/migrations/20261118191500_restrict_free_agent_contract_negotiation_to_owner.sql"
    assert all(path.is_file() for path in [contract_lock_fix,roster_registration_fix,owner_negotiation_fix]), "Missing contract lifecycle and roster registration hardening migrations"
    assert "new.annual_salary is distinct from old.annual_salary" in contract_lock_fix.read_text(encoding="utf-8")
    assert "on conflict(season_id,member_id) do nothing" in roster_registration_fix.read_text(encoding="utf-8")
    assert "v_actor.role<>'Owner'" in owner_negotiation_fix.read_text(encoding="utf-8")
    legacy_license_alias = ROOT / "supabase/migrations/20261118192000_legacy_a_license_salary_alias.sql"
    assert legacy_license_alias.is_file() and "'A','super',22600000,45000000" in legacy_license_alias.read_text(encoding="utf-8")
    assert (ROOT / "src/team-job-advert.css").is_file() and (ROOT / "src/team-driver-registration.css").is_file()
    negotiation_limits_fix = ROOT / "supabase/migrations/20261118192500_apply_existing_driver_negotiation_limits.sql"
    assert negotiation_limits_fix.is_file()
    assert "driver-move-negotiation-limits" in negotiation_limits_fix.read_text(encoding="utf-8")
    assert "max_total_counters" in negotiation_limits_fix.read_text(encoding="utf-8")
    assert "max_counters_per_side" in negotiation_limits_fix.read_text(encoding="utf-8")
    contracts_ui = (ROOT / "src/TeamDriverContracts.tsx").read_text(encoding="utf-8")
    contracts_css = (ROOT / "src/team-contracts.css").read_text(encoding="utf-8")
    assert "LEGACY DATA" in contracts_ui and "caleris_driver_salary_bands" in contracts_ui
    assert ".team-contracts-legacy" in contracts_css
    auto_season_migration = ROOT / "supabase/migrations/20261118203000_configurable_caleris_circuit_schedule.sql"
    auto_season_ui = (ROOT / "src/AdminLicenseEngine.tsx").read_text(encoding="utf-8")
    auto_calendar_ui = (ROOT / "src/AdminSeasonCalendar.tsx").read_text(encoding="utf-8")
    event_control_ui = (ROOT / "src/FIAEventControlCenter.tsx").read_text(encoding="utf-8")
    assert auto_season_migration.is_file(), "Missing one-step CALERIS season setup migration"
    auto_season_sql = auto_season_migration.read_text(encoding="utf-8")
    for fragment in ["fia_create_caleris_season", "p_schedule jsonb", "jsonb_array_length(v_premio_circuits) not between 3 and 5", "jsonb_array_length(v_zwei_circuits) not between 3 and 5", "v_premio_total>25 or v_zwei_total>25", "caleris_circuits", "circuit_name", "fia_create_season_calendar", "periods_created"]:
        assert fragment in auto_season_sql, f"Automated season migration missing: {fragment}"
    for fragment in ["fia_create_caleris_season", "CALERIS PREMIO", "CALERIS ZWEI", "ACTIVE SCORING RULES", "scoring-milestone-", "Tidak ada input standings atau final WDC manual", "p_schedule:payload", "caleris_circuits", "license-schedule-table", "Tambah race"]:
        assert fragment in auto_season_ui, f"Simplified License Engine missing: {fragment}"
    for obsolete_control in ["saveRoundStanding", "saveFinalStanding", "registerDriver", "createRound", "standingPoints"]:
        assert obsolete_control not in auto_season_ui, f"Manual scoring/round input remains in License Engine: {obsolete_control}"
    for fragment in ["Reschedule seluruh kalender", "fia_reschedule_season_calendar", "12 periode", "circuit_name", "3–5 race per divisi"]:
        assert fragment in auto_calendar_ui, f"Automated Season Calendar missing: {fragment}"
    assert "Satu kali setup" in event_control_ui and "kalender 12 periode" in event_control_ui
    license_readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "one-step season setup" in license_readme and "15–25 race rounds per division" in license_readme and "Circuit Pool" in license_readme
    remove_legacy_season_creator = ROOT / "supabase/migrations/20261118203100_remove_legacy_season_creator.sql"
    assert remove_legacy_season_creator.is_file(), "Legacy one-input season creator must be removed"
    assert "drop function if exists public.fia_create_caleris_season(date)" in remove_legacy_season_creator.read_text(encoding="utf-8")
    wdc_defaults_migration = ROOT / "supabase/migrations/20261118200000_activate_lifetime_wdc_defaults.sql"
    assert wdc_defaults_migration.is_file(), "Missing approved lifetime WDC defaults migration"
    wdc_defaults_sql = wdc_defaults_migration.read_text(encoding="utf-8")
    for fragment in ["to_jsonb(25)", "to_jsonb(35)", "requires_admin_setup", "is_active=true", "scoring-wdc-zwei", "scoring-wdc-premio"]:
        assert fragment in wdc_defaults_sql, f"Lifetime WDC defaults migration missing: {fragment}"
    assert "WDC ZWEI · TIER 2" in auto_season_ui and "WDC PREMIO · TIER 1" in auto_season_ui
    assert "Zwei +25" in auto_season_ui and "Premio +35" in auto_season_ui
    circuit_reuse_migration = ROOT / "supabase/migrations/20261118210000_season_circuit_usage_rules.sql"
    assert circuit_reuse_migration.is_file(), "Missing per-season circuit usage migration"
    circuit_reuse_sql = circuit_reuse_migration.read_text(encoding="utf-8")
    assert "schedule.flatMap((period,periodIndex)" in auto_season_ui
    assert "Sirkuit hanya boleh dipakai satu kali per season" in auto_season_ui
    assert "group by c.value" in circuit_reuse_sql and "Caleris Premio" in circuit_reuse_sql and "Caleris Zwei" in circuit_reuse_sql
    assert "Premio dan Zwei boleh memakai sirkuit yang sama pada tanggal yang sama" in auto_season_ui
    assert "Zwei gives 25 points and Premio gives 35 points" in license_readme
    print("Caleris QA static checks passed.")

if __name__ == "__main__":
    main()

