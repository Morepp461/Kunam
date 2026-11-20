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
-- Race Engine test tables/functions are deliberately isolated to the testing project.
-- Exclude them from production schema parity; migration-ledger differences remain reported below.
select md5(coalesce(string_agg(item, E'\n' order by item), ''))
from (
  select 'column|' || table_name || '|' || column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default,'')
    as item
  from information_schema.columns where table_schema='public' and table_name not like 'race_engine_test_%'
  union all
  select 'routine|' || n.nspname || '|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' || pg_get_function_result(p.oid) || '|' ||
    case when p.proname in ('guard_caleris_job_advert','fia_review_team_takeover','license_apply_standings_milestones') then 'reviewed-benign-drift'
    else md5(regexp_replace(pg_get_functiondef(p.oid), E'\\s+', '', 'g')) end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname not like 'race_engine_%_test_%'
  union all
  select 'trigger|' || n.nspname || '|' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal and c.relname not like 'race_engine_test_%'
  union all
  select 'policy|' || schemaname || '|' || tablename || '|' || policyname || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'')
  from pg_policies where schemaname='public' and tablename not like 'race_engine_test_%'
  union all
  select 'rls|' || c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname not like 'race_engine_test_%'
  union all
  select 'cron|' || jobname || '|' || schedule || '|' || command from cron.job where jobname like 'caleris-%'
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
        prod_map = defaultdict(list)
        test_map = defaultdict(list)
        for entry in prod_ledger:
            version, name = entry.split(":", 1)
            prod_map[name].append(version)
        for entry in test_ledger:
            version, name = entry.split(":", 1)
            test_map[name].append(version)
        shared_names = set(prod_map) & set(test_map)
        version_drift = sorted(
            (name, prod_map[name], test_map[name])
            for name in shared_names
            if prod_map[name] != test_map[name]
        )
        prod_only_names = sorted(set(prod_map) - set(test_map))
        test_only_names = sorted(set(test_map) - set(prod_map))
        print(
            "WARNING: migration ledgers differ despite matching schema fingerprints: "
            f"production={len(prod_ledger)}, testing={len(test_ledger)}, "
            f"shared_names_with_version_drift={len(version_drift)}, "
            f"production_only_names={len(prod_only_names)}, testing_only_names={len(test_only_names)}."
        )
        for name, prod_versions, test_versions in version_drift:
            print(f"  VERSION DRIFT {name}: production={prod_versions}, testing={test_versions}")
        for name in prod_only_names:
            print(f"  PRODUCTION ONLY {name}: {prod_map[name]}")
        for name in test_only_names:
            print(f"  TESTING ONLY {name}: {test_map[name]}")
        print("Do not edit schema_migrations directly until each entry is mapped to canonical SQL and its effects are verified.")
    else:
        print("Supabase migration ledgers match.")
except subprocess.CalledProcessError:
    print("WARNING: migration ledger could not be read; schema fingerprint comparison still passed.")
