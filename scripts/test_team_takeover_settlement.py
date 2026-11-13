from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = ROOT / "supabase/migrations/20261113040440_team_takeover_settlement_and_role_transfer.sql"
ui = (ROOT / "src/TeamTakeoverMarket.tsx").read_text(encoding="utf-8")
fia = (ROOT / "src/FIAOperations.tsx").read_text(encoding="utf-8")
readme = (ROOT / "README.md").read_text(encoding="utf-8")

assert migration.is_file(), "Team Take Over settlement migration is missing"
sql = migration.read_text(encoding="utf-8").lower()

# Buyer eligibility and seller identity are checked by member identity, not team affiliation.
assert "v_actor.role not in ('driver','fia')" in sql
assert "v_actor.role<>'owner'" in sql
assert "v_actor.id not in (v_take.buyer_member_id,v_take.seller_member_id)" in sql
assert "v_last.offered_by_member_id=v_actor.id" in sql

# Settlement is one atomic, ledger-backed operation.
assert "private.post_economy_transaction" in sql
assert "'transfer'" in sql
assert "'team-takeover:'||v_take.id::text" in sql
assert "account_kind='driver'" in sql
assert "account_kind='public_member'" in sql
assert "account_kind='team_owner'" in sql
assert "set role=null,team_id=null where id=v_seller.id" in sql
assert "set role='owner',team_id=v_team.id where id=v_buyer.id" in sql
assert "status='completed'" in sql and "transaction_id=" in sql and "settled_at=now()" in sql
assert "members_one_team_owner_per_team" in sql
assert "revoke all on function public.fia_review_team_takeover(uuid,boolean) from public,anon,service_role" in sql

# Member UI exposes buyer flow to Public Member, Driver, and FIA only.
assert 'member.role===null||member.role==="Driver"||member.role==="FIA"' in ui
assert 'member?.role==="Owner"' in ui
assert "t.buyer_member_id===member?.id||t.seller_member_id===member?.id" in ui
assert 't.status==="completed"' in ui
assert "approved_pending_execution_rules" not in ui

# FIA approval now settles the deal, rather than leaving an unexecuted approval.
assert "p_approve:approve" in fia
assert "pembayaran dan perpindahan" in fia.lower()
assert "Team Take Over" in readme and "Team Owner wallet" in readme
assert "20261113040440_team_takeover_settlement_and_role_transfer.sql" in readme

print("Team Take Over settlement regression checks passed.")
