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
    app = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
    styles = (ROOT / "src/styles.css").read_text(encoding="utf-8")
    sql = (ROOT / "supabase/SETUP.sql").read_text(encoding="utf-8")
    assert 'provider:"discord"' in app
    assert '<div className="scene" aria-hidden="true"><img className="scene-image" src="/assets/Background%202.png" alt=""/>' in app
    assert "data-member=" not in app
    assert '"/rules"' in app or 'path="/rules"' in app
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
    print("Caleris QA static checks passed.")

if __name__ == "__main__":
    main()
