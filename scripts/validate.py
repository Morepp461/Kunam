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
    economy_gateway_migration = ROOT / "supabase/migrations/20261112171000_economy_edge_gateway.sql"
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
    economy_query_migration = ROOT / "supabase/migrations/20261112172000_economy_engine_query_hardening.sql"
    assert economy_query_migration.is_file(), "Missing Economy Engine query hardening migration"
    query_sql = economy_query_migration.read_text(encoding="utf-8")
    for fragment in ["economy_transactions_created_by_idx", "economy_reward_claims_member_idx", "economy_reward_claims_source_idx", "Members and admins read economy wallets"]:
        assert fragment in query_sql, f"Economy query hardening missing: {fragment}"
    app = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
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
    rls_fix = ROOT / "supabase/migrations/20261112110000_split_public_content_rls_admin_lookup.sql"
    assert rls_fix.is_file(), "Missing public RLS split migration"
    rls_source = rls_fix.read_text(encoding="utf-8")
    assert "TO anon, authenticated" in rls_source
    assert "TO authenticated" in rls_source
    assert '"Public can read community setting"' in rls_source
    assert '"Admins read all site settings"' in rls_source
    assert '"Public can read published content"' in rls_source
    assert '"Admins read all site content"' in rls_source
    assert "},100);return()=>{active=false;window.clearTimeout(timer)}" in app
    permissions_migration = ROOT / "supabase/migrations/20261112123000_grant_search_service_role_select.sql"
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
    economy_migration = ROOT / "supabase/migrations/20261112170000_economy_engine_core.sql"
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
        assert rpc in economy_source, f"Economy Engine UI missing RPC: {rpc}"
    app = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
    assert 'path="/admin/economy-engine"' in app and 'label:"Economy Engine"' in app
    assert 'from "./AdminEconomyEngine"' in app and 'from("economy_wallet_directory")' in app
    assert 'select("id,member_code,character_name,role,license,team_id,balance")' not in app
    print("Caleris QA static checks passed.")

if __name__ == "__main__":
    main()
