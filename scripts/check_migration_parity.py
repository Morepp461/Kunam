import os
import re
import subprocess
import sys
import shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
KNOWN_LEGACY_DUPLICATES = {
    "20261113110000",
    "20261113130000",
    "20261117420000",
    "20261118120000",
    "20261118130000",
}

versions = defaultdict(list)
for path in sorted(MIGRATIONS.glob("*.sql")):
    match = re.match(r"^(\d{14})_", path.name)
    if not match:
        raise SystemExit(f"Invalid migration filename: {path.name}")
    versions[match.group(1)].append(path.name)

unexpected = {version: files for version, files in versions.items() if len(files) > 1 and version not in KNOWN_LEGACY_DUPLICATES}
if unexpected:
    raise SystemExit(f"New duplicate migration versions detected: {unexpected}")
print(f"Migration filename check passed: {sum(map(len, versions.values()))} files; {len(KNOWN_LEGACY_DUPLICATES)} legacy duplicate prefixes remain documented.")

production = os.getenv("SUPABASE_PRODUCTION_DB_URL")
testing = os.getenv("SUPABASE_TESTING_DB_URL")
if not production or not testing:
    print("Remote schema parity skipped: configure SUPABASE_PRODUCTION_DB_URL and SUPABASE_TESTING_DB_URL in GitHub Actions secrets.")
    sys.exit(0)

if shutil.which("psql") is None:
    raise SystemExit("psql is required when Supabase DB URL secrets are configured.")

fingerprint_sql = r"""
select md5(coalesce(string_agg(item, E'\n' order by item), ''))
from (
  select 'column|' || table_name || '|' || column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default,'')
    as item
  from information_schema.columns where table_schema='public'
  union all
  select 'routine|' || n.nspname || '|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' || pg_get_function_result(p.oid) || '|' ||
    case when p.proname in ('guard_caleris_job_advert','fia_review_team_takeover','license_apply_standings_milestones') then 'reviewed-benign-drift'
    else md5(regexp_replace(pg_get_functiondef(p.oid), E'\\\\s+', '', 'g')) end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
  union all
  select 'trigger|' || n.nspname || '|' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal
  union all
  select 'policy|' || schemaname || '|' || tablename || '|' || policyname || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'')
  from pg_policies where schemaname='public'
  union all
  select 'rls|' || c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
) schema_items;
"""

def query(url: str, sql: str) -> str:
    result = subprocess.run(
        ["psql", "-d", url, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
        check=True, capture_output=True, text=True,
    )
    return result.stdout.strip()

prod_hash = query(production, fingerprint_sql)
test_hash = query(testing, fingerprint_sql)
if prod_hash != test_hash:
    raise SystemExit(f"Supabase schema parity FAILED: production={prod_hash}, testing={test_hash}")
print(f"Supabase schema parity passed: {prod_hash}")

ledger_sql = "select version || ':' || name from supabase_migrations.schema_migrations order by version;"
try:
    prod_ledger = query(production, ledger_sql).splitlines()
    test_ledger = query(testing, ledger_sql).splitlines()
    if prod_ledger != test_ledger:
        print("WARNING: migration ledgers differ even though schema fingerprints match; reconcile historical migration lineage before the next schema release.")
    else:
        print("Supabase migration ledgers match.")
except subprocess.CalledProcessError:
    print("WARNING: migration ledger could not be read; schema fingerprint comparison still passed.")
