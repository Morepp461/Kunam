from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
migration_files = sorted(
    MIGRATIONS.glob("*_economy_member_wallets_permanent_across_role_changes.sql")
)
assert len(migration_files) == 1, "Expected exactly one permanent member-wallet migration"
sql = migration_files[0].read_text(encoding="utf-8").lower()

# Existing disabled role wallets are restored without changing IDs or balances.
assert "update public.economy_wallet_accounts" in sql
assert "set is_active=true, updated_at=now()" in sql
assert "where account_kind in ('driver','team_owner')" in sql

# Role changes may create/reactivate the corresponding wallet, but must never
# deactivate a wallet when a member leaves a role.
function_body = sql.split("create or replace function private.ensure_member_economy_wallets()", 1)[1]
function_body = function_body.split("$$;", 1)[0]
assert "if new.role='driver' then" in function_body
assert "if new.role='owner' then" in function_body
assert "do update set is_active=true,updated_at=now()" in function_body
assert "set is_active=false" not in function_body
assert "else" not in function_body

# A database trigger rejects any attempt to insert/update a role wallet inactive.
assert "create or replace function private.guard_member_economy_wallet_active()" in sql
assert "new.account_kind in ('driver','team_owner') and new.is_active is not true" in sql
assert "member role wallets are permanent and cannot be deactivated" in sql
assert "create trigger economy_member_wallet_permanent_active" in sql
assert "before insert or update on public.economy_wallet_accounts" in sql

print("Economy wallet lifecycle checks passed.")
