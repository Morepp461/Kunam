from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")

start = APP.index("function AdminWorkflow(")
end = APP.index("type PublicMemberProfileData", start)
component = APP[start:end]

assert 'from("site_admins").select("user_id")' in component
assert 'Role FIA tidak memberikan akses' in component
required_routes = [
    "/admin/configuration",
    "/admin/license-engine",
    "/admin/economy-engine",
    "/admin/prizepool",
    "/admin/quest-engine",
    "/admin/pricing",
    "/admin/registered-members",
    "/admin/users",
    "/admin/team-inactivity",
    "/admin/operations",
    "/admin/adjustments",
    "/admin/operations-intelligence",
    "/admin/brand-ecosystem",
    "/admin/sponsorship",
    "/admin",
    "/admin/test-personas",
    "/admin/race-engine-lab",
]
for route in required_routes:
    assert f'"{route}"' in component, f"Missing admin hub route: {route}"

assert '<Link className="admin-workflow-link" to={href}' in component
assert "CRM workflow belum diaktifkan" in component
assert "pipeline CRM" in component
assert "supabase.rpc(" not in component
assert "supabase.from(" in component  # allow-list read only
assert "setAllowed(Boolean(data?.user_id))" in component
print("Admin Workflow hub routes, allow-list boundary, and read-only behavior checks passed.")
