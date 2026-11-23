from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = (ROOT / "supabase/migrations/20261123110000_driver_contract_request_workflow.sql").read_text()
ui = (ROOT / "src/CalerisIntelligence.tsx").read_text()
app = (ROOT / "src/App.tsx").read_text()
first_contract = (ROOT / "supabase/migrations/20261123140000_driver_first_contract_request_support.sql").read_text()

for token in [
    "caleris_driver_contract_requests", "one_pending_per_driver",
    "member_submit_driver_contract_request", "team_owner_offer_driver_renewal_from_request",
    "team_owner_decline_driver_contract_request", "v_member.role<>'Driver'",
    "v_actor.role<>'Owner'", "salary_min_eur,salary_max_eur",
    "status='pending'", "status='offer_sent'", "status='declined'",
]:
    assert token in migration, f"Missing contract request control: {token}"

for token in [
    "member_submit_driver_contract_request", "team_owner_offer_driver_renewal_from_request",
    "team_owner_decline_driver_contract_request", "Ajukan kontrak baru ke Team Owner",
    "Pengajuan dari Driver", "member?.team_id", "salary_min_eur", "requests.some(r=>r.status===",
]:
    assert token in ui, f"Missing driver/owner contract UI: {token}"

assert 'path="/driver-panel/contract-renewals"' in app
assert 'panelAccess.member_role==="Driver"' in app
assert 'path="/team-panel/contract-renewals"' in app
assert 'panelAccess.member_role==="Owner"' in app

print("Driver first-contract and renewal requests, owner offers, salary band and role-route checks passed.")
