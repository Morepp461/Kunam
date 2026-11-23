from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = (ROOT / "supabase/migrations/20261123120000_admin_manage_user_moderation.sql").read_text()
edge = (ROOT / "supabase/functions/admin-user-management/index.ts").read_text()
ui = (ROOT / "src/AdminUsers.tsx").read_text()
indexes = (ROOT / "supabase/migrations/20261123150000_caleris_scope_fk_indexes.sql").read_text()

for token in [
    "caleris_user_moderation_actions", "warning", "temporary_ban", "permanent_ban",
    "team_assignment", "created_by", "expires_at", "previous_account_status",
    "public.member_sync_expired_ban", "grant execute on function public.member_sync_expired_ban() to authenticated",
]:
    assert token in migration, f"Missing moderation schema/control: {token}"

for token in [
    'authClient.auth.getUser(jwt)', 'from("site_admins")', 'action === "update_roles"',
    'action === "assign_team"', 'action === "warn_user"', 'action === "ban_user"',
    'action === "unban_user"', 'targetUserId === actorId',
    'admin.auth.admin.updateUserById(targetUserId,{ban_duration:banDuration})',
    'account_status:"suspended"', 'previous_account_status',
    'action_type:banType==="temporary"?"temporary_ban":"permanent_ban"',
]:
    assert token in edge, f"Missing server-side moderation guard: {token}"

assert 'supabase.functions.invoke("admin-user-management"' in ui
assert "Kirim peringatan" in ui or "Peringatan" in ui
assert "Ban permanen" in ui or "Permanen" in ui
assert "assign_team" in ui and "warn_user" in ui and "ban_user" in ui

for token in ["caleris_user_moderation_actions_created_by_fk_idx","caleris_user_moderation_actions_target_member_fk_idx"]:
    assert token in indexes, f"Missing moderation FK index: {token}"

print("Manage User authorization, role/team actions, warning, ban audit and FK index checks passed.")
