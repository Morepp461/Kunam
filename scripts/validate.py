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
