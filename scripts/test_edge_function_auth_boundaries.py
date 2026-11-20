from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

directory = read("supabase/functions/member-directory/index.ts")
paddock = read("supabase/functions/complete-paddock-access/index.ts")
integrations = read("supabase/functions/caleris-integrations/index.ts")
admin = read("supabase/functions/admin-user-management/index.ts")
economy = read("supabase/functions/economy-engine/index.ts")
workflows = read("supabase/functions/economy-workflows/index.ts")

assert '.in("account_status", ["public", "active", "admin"]).maybeSingle()' in directory
assert 'if (!userId || !isAdmin)' in directory
assert 'resolveClientIp(req)' in directory
assert 'cf-connecting-ip' in directory and 'x-forwarded-for' in directory
assert 'crypto.subtle.importKey' in directory and 'HMAC' in directory
assert 'consume_member_directory_rate_limit' in directory
assert 'Retry-After' in directory and 'respond(429' in directory
assert directory.index('if (!userId || !isAdmin)') < directory.index('member-directory:update_member_id:admin:')
assert 'authClient.auth.getUser(jwt)' in directory
assert 'cm_live_' in integrations and 'sha256(token)' in integrations
assert 'authClient.auth.getUser(jwt)' in paddock
assert 'authClient.auth.getUser(jwt)' in admin and 'site_admins' in admin
assert 'authClient.auth.getUser(jwt)' in economy and 'site_admins' in economy
assert 'auth.auth.getUser(jwt)' in workflows


config = read("supabase/config.toml")
race_engine = read("supabase/functions/race-engine-test-service/index.ts")

race_engine_config = config.split("[functions.race-engine-test-service]", 1)[1]
assert race_engine_config is not None and "verify_jwt = false" in race_engine_config.split("[functions.", 1)[0]
assert 'if (action === "background_tick")' in race_engine
assert 'req.headers.get("x-race-worker-token")' in race_engine
assert 'race_engine_validate_worker_token' in race_engine
assert 'await requireTestingAdmin(req)' in race_engine
assert 'auth.getUser(token)' in race_engine
assert '.from("site_admins")' in race_engine

print("Edge Function auth boundaries, managed worker token, and Admin authorization checks passed.")
