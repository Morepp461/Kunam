from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
migration = MIGRATIONS / "20261113034921_wealth_tax_scoped_assessment_ledger.sql"
gateway_migration = MIGRATIONS / "20261113034952_wealth_tax_admin_gateway_permissions.sql"
admin_ui = (ROOT / "src" / "AdminOperations.tsx").read_text(encoding="utf-8")
gateway = (ROOT / "supabase" / "functions" / "economy-engine" / "index.ts").read_text(encoding="utf-8")

assert migration.is_file(), "Scoped Wealth Tax migration is missing"
assert gateway_migration.is_file(), "Wealth Tax gateway permission migration is missing"
sql = migration.read_text(encoding="utf-8").lower()
gateway_sql = gateway_migration.read_text(encoding="utf-8").lower()

# Two independent taxable bases and independently editable rule thresholds.
assert "tax_scope text not null default 'member'" in sql
assert "tax_scope='member'" in sql and "tax_scope='team'" in sql
assert "caleris_tax_rules_wealth_scope_threshold_unique" in sql
aggregation_migration = MIGRATIONS / "20261113035234_wealth_tax_personal_wallet_aggregation_and_lock_order.sql"
assert aggregation_migration.is_file(), "Personal-wallet aggregation and lock-order migration is missing"
aggregation_sql = aggregation_migration.read_text(encoding="utf-8").lower()
assert "w.account_kind='public_member'" in aggregation_sql
assert "caleris_tax_rules_driver_transfer_member_scope" in aggregation_sql
assert "order by w.id" in aggregation_sql and "for update" in aggregation_sql

# Member wealth aggregates personal role wallets; team wealth uses only Team Wallet.
assert "w.account_kind in ('driver','team_owner')" in sql
assert "w.account_kind='public_member'" in sql
assert "p.member_id" in sql
assert "sum(w.balance)" in sql
assert "w.account_kind='team'" in sql
assert "v_member.total_balance>r.minimum_base" in sql
assert "v_team.total_balance>r.minimum_base" in sql

# One highest threshold is applied to the whole balance, never progressive slices.
assert "order by r.minimum_base desc" in sql
assert "round(v_member.total_balance*v_rule.rate_percent/100,2)" in sql
assert "round(v_team.total_balance*v_rule.rate_percent/100,2)" in sql
assert "progressive" not in sql
assert "v_member_rule_count<>3 or v_team_rule_count<>3" in sql
assert "lag(r.rate_percent)" in sql
assert "rate_percent<=tiers.previous_rate" in sql
three_tier_migration = MIGRATIONS / "20261113035324_wealth_tax_exact_three_tier_validation.sql"
assert three_tier_migration.is_file(), "Three-tier validation migration is missing"
three_tier_sql = three_tier_migration.read_text(encoding="utf-8").lower()
assert "v_member_rule_count<>3 or v_team_rule_count<>3" in three_tier_sql
assert "lag(r.rate_percent)" in three_tier_sql

# Collection is ledger-backed, idempotent, split across member wallets, and
# checks total available balance before posting any debit.
assert "private.post_economy_transaction" in sql
assert "'wealth-tax:'" in sql
assert "v_total<v_remaining" in sql
assert "order by w.id" in sql and "for update" in sql
assert "caleris_wealth_tax_collections_v2" in sql
assert "enable row level security" in sql

# Admin functions are only callable through the verified service gateway.
assert "revoke all on function public.admin_generate_wealth_tax_assessments(uuid) from public,anon,authenticated,service_role" in gateway_sql
assert "grant execute on function public.admin_generate_wealth_tax_assessments(uuid,uuid) to service_role" in gateway_sql
assert "p_actor_id" in gateway_sql

# Admin can configure both scopes and run assessment/collection through the
# JWT-verified Economy Engine Edge Function.
assert 'tax_scope==="team"' in admin_ui
assert 'wealth_tax_assess' in admin_ui and 'wealth_tax_collect' in admin_ui
assert 'supabase.functions.invoke("economy-engine"' in admin_ui
assert 'action === "wealth_tax_assess" || action === "wealth_tax_collect"' in gateway
assert 'p_actor_id: userId' in gateway

print("Wealth Tax engine regression checks passed.")
