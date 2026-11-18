from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

directory = read("supabase/functions/member-directory/index.ts")
migration = read("supabase/migrations/20261118193000_member_directory_rate_limit.sql")
config = read("supabase/config.toml")

assert "resolveClientIp(req)" in directory
assert 'req.headers.get("cf-connecting-ip")' in directory
assert 'req.headers.get("x-forwarded-for")' in directory
assert "crypto.subtle.importKey" in directory and '"HMAC"' in directory
assert "consume_member_directory_rate_limit" in directory
assert 'enforceIpLimit("profile", 60, 60)' in directory
assert 'enforceIpLimit("search", 120, 60)' in directory
assert 'enforceIpLimit("update_member_id", 30, 300)' in directory
assert 'member-directory:update_member_id:admin:' in directory
assert 'if (!userId || !isAdmin)' in directory
assert directory.index('if (!userId || !isAdmin)') < directory.index('member-directory:update_member_id:admin:')
assert 'respond(429' in directory and '"Retry-After"' in directory
assert "Fail open to preserve public directory availability" in directory

assert "private.member_directory_rate_limits" in migration
assert "pg_advisory_xact_lock" in migration
assert "security definer" in migration.lower()
assert "set search_path = pg_catalog" in migration
assert "revoke all on function" in migration
assert "grant execute on function" in migration and "to service_role" in migration
assert "enable row level security" in migration
assert "interval '24 hours'" in migration

assert "[functions.member-directory]" in config and "verify_jwt = false" in config
print("Member Directory rate-limit and authorization-boundary checks passed.")
