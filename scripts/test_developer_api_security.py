from pathlib import Path

root = Path(__file__).resolve().parents[1]
owner_migration = (root / "supabase/migrations/20261117054919_developer_api_primary_owner.sql").read_text()
keys_migration = (root / "supabase/migrations/20261117054738_owner_developer_api_keys.sql").read_text()
edge = (root / "supabase/functions/caleris-integrations/index.ts").read_text()
ui = (root / "src/DeveloperAPI.tsx").read_text()
app = (root / "src/App.tsx").read_text()

assert "caleris_developer_api_owner" in owner_migration
assert "order by admin.created_at asc" in owner_migration.lower()
assert "auth.uid() = owner_user_id" in owner_migration
assert "enable row level security" in keys_migration.lower()
assert "revoke all on public.caleris_api_keys from anon, authenticated" in keys_migration.lower()
assert "key_hash" in edge and "sha256" in edge.lower()
assert "revoked_at" in edge and "expires_at" in edge
assert "cm_live_" in edge
assert "caleris_developer_api_owner" in edge
assert "endpointPath.startsWith(\"/v1/\")" in edge
assert "tools/call" in edge and "tools/list" in edge
assert "list_circuits" in edge and "list_rounds" in edge
assert "OWNER_USER_ID" not in ui and "OWNER_USER_ID" not in app and "OWNER_USER_ID" not in edge
assert "caleris_developer_api_owner" in ui
assert "isPrimaryOwner" in app
assert "arbitrary SQL" in (root / "README.md").read_text()
print("Developer API owner isolation and integration gateway checks passed.")
