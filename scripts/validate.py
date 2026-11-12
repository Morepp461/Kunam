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
    assert 'data-member={session ? "true" : "false"}' in app
    assert '/assets/Untitled%20design_20261103_142659_0000.png' in app
    assert '/assets/Background%202.png' in app
    assert '"/rules"' in app or 'path="/rules"' in app
    assert "site_admins" in app and "site_content" in app and "site_settings" in app
    assert "tire-trace" in app and "toast-stack" in app and "global-progress" in styles
    assert "cinematicCamera" in styles and "spotlightSweep" in styles
    assert "enable row level security" in sql.lower()
    assert "create policy" in sql.lower()
    print("Caleris QA static checks passed.")

if __name__ == "__main__":
    main()
