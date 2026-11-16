from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
registration = MIGRATIONS / "20261116195000_main_event_member_registration.sql"
rejection_guard = MIGRATIONS / "20261116200000_main_event_registration_rejection_guard.sql"
assert registration.is_file(), "Missing Main Event registration migration"
assert rejection_guard.is_file(), "Missing registration rejection cleanup migration"
name_guard = MIGRATIONS / "20261116201000_main_event_registration_name_and_payload_guards.sql"
assert name_guard.is_file(), "Missing registration payload and duplicate team-name guard"
avatar_guard = MIGRATIONS / "20261116202000_main_event_registration_avatar_requirement.sql"
assert avatar_guard.is_file(), "Missing required avatar migration"
owner_engine = MIGRATIONS / "20261116220000_main_event_owner_engine_division_and_capital.sql"
admin_engine_details = MIGRATIONS / "20261116221000_main_event_registration_admin_engine_details.sql"
assert owner_engine.is_file(), "Missing Team Owner engine/division migration"
assert admin_engine_details.is_file(), "Missing Admin engine detail migration"

sql = registration.read_text(encoding="utf-8").lower()
for fragment in [
    "public.caleris_member_registrations",
    "public.caleris_team_driver_applications",
    "public.submit_main_event_registration",
    "public.admin_list_member_registrations",
    "public.team_list_driver_applications",
    "public.admin_review_member_registration",
    "security definer",
    "set search_path=''",
    "exists(select 1 from public.site_admins",
    "v_role not in ('driver','owner')",
    "profile-avatars",
    "team-logos",
    "role='driver'",
    "role='owner'",
    "public.caleris_team_profiles",
    "long_term_target",
    "enable row level security",
    "revoke all on public.caleris_member_registrations",
    "grant execute on function public.submit_main_event_registration(jsonb) to authenticated",
]:
    assert fragment in sql, f"Registration security/workflow is missing: {fragment}"

guard = rejection_guard.read_text(encoding="utf-8").lower()
assert "new.status='rejected'" in guard and "set status='withdrawn'" in guard
name_sql = name_guard.read_text(encoding="utf-8").lower()
avatar_sql = avatar_guard.read_text(encoding="utf-8").lower()
assert "requested_role='owner'" in avatar_sql and "avatar_path is not null" in avatar_sql
assert "avatar_path=v_registration.avatar_path" in avatar_sql
assert "teams_name_case_insensitive_unique" in name_sql and "v_role is null or v_role not in" in name_sql

form = (ROOT / "src" / "MainEventRegistration.tsx").read_text(encoding="utf-8")
for fragment in [
    "STEP 01 / 02",
    "STEP 02 / 02",
    "nationality",
    "hometown",
    "avatar.type!==\"image/webp\"",
    "optimizeImageToWebp",
    "Avatar · Wajib",
    "Team Owner",
    "FIA hanya dapat diberikan melalui undangan khusus Admin",
    "driver_number_preference",
    "preferred_team_id",
    "driver_epithet",
    "team_base_nation",
    "team_long_term_target",
    'rpc("submit_main_event_registration_v2"',
]:
    assert fragment in form, f"Main Event registration form is missing: {fragment}"

admin = (ROOT / "src" / "AdminRegisteredMembers.tsx").read_text(encoding="utf-8")
for fragment in ['rpc("admin_list_member_registrations_v2")', 'rpc("admin_review_main_event_registration_v2"', '"approve"', '"reject"', "team_vision", "team_long_term_target"]:
    assert fragment in admin, f"Registered Member review is missing: {fragment}"

team_inbox = (ROOT / "src" / "TeamDriverApplications.tsx").read_text(encoding="utf-8")
assert 'rpc("team_list_driver_applications")' in team_inbox

app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
for route in ['/main-event/registration', '/admin/registered-members', '/team-panel/driver-registration', '/team-panel/engine-market']:
    assert route in app, f"Missing registration route: {route}"

navigation = (ROOT / "src" / "PanelPages.tsx").read_text(encoding="utf-8")
assert 'path: "registration", label: "Registration"' in navigation
assert 'path: "engine-market", label: "Engine Market"' in navigation


owner_sql = owner_engine.read_text(encoding="utf-8").lower()
for fragment in [
    "initial_division", "engine_choice", "requested_engine_name", "selected_engine_id",
    "list_main_event_engine_marketplace", "team_set_engine_sale_listing",
    "admin_review_main_event_registration_v2", "submit_main_event_registration_v2",
    "main-event-division:", "v_count>=12", "v_count>=14",
    "asking_price between 5000000 and 25000000", "80000000",
    "800000000", "500000000", "10000000", "999999999999.00",
    "main-event-engine-purchase", "main-event-team-capital",
]:
    assert fragment in owner_sql, f"Owner engine/division/capital workflow is missing: {fragment}"
assert "admin_list_member_registrations_v2" in admin_engine_details.read_text(encoding="utf-8").lower()

engine_market = (ROOT / "src" / "TeamEngineMarket.tsx").read_text(encoding="utf-8")
for fragment in ['rpc("team_list_owned_engines")', 'rpc("team_set_engine_sale_listing")', "5000000", "25000000"]:
    assert fragment in engine_market, f"Team Engine Market is missing: {fragment}"

print("Main Event registration regression checks passed.")
