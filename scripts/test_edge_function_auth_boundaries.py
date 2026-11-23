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

assert '.in("account_status", ["public", "active", "admin"])' in directory
assert '.eq("member_id", memberId).maybeSingle()' in directory
assert '.eq("public_member_id", memberId.toUpperCase()).maybeSingle()' in directory
assert 'action === "team_profile"' in directory
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

print("Edge Function auth boundaries and public profile visibility checks passed.")
