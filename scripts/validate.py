from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def main():
    required = [
        "package.json", "index.html", "vite.config.ts", "src/main.tsx",
        "src/App.tsx", "src/styles.css", "src/lib/supabase.ts",
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
    ]
    for migration in history_aligned_migrations:
        assert (ROOT / "supabase/migrations" / migration).is_file(), f"Missing Supabase-history-aligned migration: {migration}"
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
    for fragment in ["driver-panel", "career-history", "financial-centre", "team-summary", "driver-registration", "place-job-advert", "caleris_announcements", "caleris_regulations", "caleris_appeals", "Engine Ranking", "Rookie of the Season"]:
        assert fragment in stage5, f"Stage 5 panel missing: {fragment}"
    for fragment in [".s5-workspace", ".s5-table", ".s5-hero", ".s5-main-tabs"]:
        assert fragment in stage5_css, f"Stage 5 styles missing: {fragment}"
    app = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
    assert 'import Stage5Panel from "./Stage5Panel";' in app
    assert 'path="/fia-panel/license-engine" element={isAdmin?' in app
    assert 'path="/admin/license-engine" element={session&&!needsPaddockAccess&&isAdmin?' in app
    styles = (ROOT / "src/styles.css").read_text(encoding="utf-8")
    sql = (ROOT / "supabase/SETUP.sql").read_text(encoding="utf-8")
    assert 'provider:"discord"' in app
    assert '<div className="scene" aria-hidden="true"><img className="scene-image" src="/assets/Background%202.png" alt=""/>' in app
    assert "data-member=" not in app
    assert '"/rules"' in app or 'path="/rules"' in app
    assert 'path="/privacy-policy"' in app and 'path="/terms-and-conditions"' in app
    assert 'COMMUNITY &amp; SUPPORT' in app and 'Dukung Vreeo · Socialbuzz' in app
    assert 'DIRECTOR OF VREEO.ID' in app
    for director, instagram in [
        ("Muhammad Ovella", "lllllaaaaa44444"),
        ("Agung Pradana", "pradana.3"),
        ("Muhammad Alfarel", "alfredo_owenzaus"),
        ("Liam Amir", "liam_amir26"),
        ("Suhanda Arbawi", "_suhanda08"),
    ]:
        assert director in app and instagram in app, f"Missing director link: {director}"
    assert 'footer-directors nav' in styles
    assert 'Gabung Discord' in app and 'Official Partners' not in app
    assert 'CALERIS MASTERS · POWERED BY VREEO' in app
    assert 'A Motorsport Roleplay Experience' not in app
    assert 'footer-main' in styles and 'footer-support nav' in styles
    assert 'DIRECTOR OF VREEO.ID' in app
    for director in ["Muhammad Ovella", "Agung Pradana", "Muhammad Alfarel", "Liam Amir", "Suhanda Arbawi"]:
        assert director in app
    assert 'footer-directors nav' in styles
    assert 'legal-blank-page' in app
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
    assert "VITE_CLOUDFLARE_TURNSTILE_SITE_KEY" in (ROOT / "src/App.tsx").read_text(encoding="utf-8")
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
    assert edge.is_file() and "siteverify" in edge.read_text(encoding="utf-8")
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
    assert 'path="/admin/economy-engine"' in app and 'label:"Economy Engine"' in app
    assert 'from "./AdminEconomyEngine"' in app and 'from("economy_wallet_directory")' in app
    assert 'select("id,member_code,character_name,role,license,team_id,balance")' not in app
    calendar_migration = ROOT / "supabase/migrations/20261112160305_season_calendar_and_payroll.sql"
    calendar_component = ROOT / "src/AdminSeasonCalendar.tsx"
    contracts_component = ROOT / "src/TeamDriverContracts.tsx"
    assert calendar_migration.is_file() and calendar_component.is_file() and contracts_component.is_file(), "Missing season calendar/payroll implementation"
    calendar_sql = calendar_migration.read_text(encoding="utf-8")
    calendar_source = calendar_component.read_text(encoding="utf-8")
    contracts_source = contracts_component.read_text(encoding="utf-8")
    for fragment in ["season_calendar_periods", "season_period_rounds", "economy_driver_contracts", "economy_payroll_claims", "fia_create_season_calendar", "payroll_for_period_round", "admin_process_pending_economy_payroll", "is_caleris_fia_or_admin"]:
        assert fragment in calendar_sql, f"Season calendar/payroll migration missing: {fragment}"
    for fragment in ["Off Season", "Pre Season", "Race Period", "Break Race Period", "End Season", "Reschedule", "3–5 round", "fia_create_season_calendar"]:
        assert fragment in calendar_source, f"Season calendar UI missing: {fragment}"
    assert "annual_salary" in contracts_source and "economy_driver_contracts" in contracts_source
    assert "payroll" in edge_source and "process_payroll_pending" in edge_source
    assert 'path="/fia-panel/season-calendar"' in app and 'path="/fia-panel/license-engine"' in app and 'path="/team-panel/driver-contracts"' in app
    assert 'import AdminSeasonCalendar from "./AdminSeasonCalendar"' in app and 'import TeamDriverContracts from "./TeamDriverContracts"' in app
    license_engine_source = (ROOT / "src/AdminLicenseEngine.tsx").read_text(encoding="utf-8")
    assert "FIA OPERATIONS · ADMIN ACCESS" in license_engine_source and "payrollMessage" in license_engine_source
    assert '(isAdmin||panelAccess.fia_panel)' in app

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
    assert "auth.getUser(jwt)" in cash_loan_gateway and 'rpc("member_cash_loan_preview"' in cash_loan_gateway and 'rpc("member_apply_cash_loan"' in cash_loan_gateway
    assert 'path="/financial-centre"' in app and 'import CashLoanCentre from "./CashLoanCentre"' in app
    print("Caleris QA static checks passed.")

if __name__ == "__main__":
    main()
