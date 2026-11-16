from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
registration = MIGRATIONS / "20261116195000_main_event_member_registration.sql"
rejection_guard = MIGRATIONS / "20261116200000_main_event_registration_rejection_guard.sql"
assert registration.is_file(), "Missing Main Event registration migration"
assert rejection_guard.is_file(), "Missing registration rejection cleanup migration"

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
    "new.role='driver'",
    "new.role='owner'",
    "public.caleris_team_profiles",
    "long_term_target",
    "enable row level security",
    "revoke all on public.caleris_member_registrations",
    "grant execute on function public.submit_main_event_registration(jsonb) to authenticated",
]:
    assert fragment in sql, f"Registration security/workflow is missing: {fragment}"

guard = rejection_guard.read_text(encoding="utf-8").lower()
assert "new.status='rejected'" in guard and "set status='withdrawn'" in guard

form = (ROOT / "src" / "MainEventRegistration.tsx").read_text(encoding="utf-8")
for fragment in [
    "STEP 01 / 02",
    "STEP 02 / 02",
    "nationality",
    "hometown",
    "Team Owner",
    "FIA hanya dapat diberikan melalui undangan khusus Admin",
    "driver_number_preference",
    "preferred_team_id",
    "driver_epithet",
    "team_base_nation",
    "team_long_term_target",
    'rpc("submit_main_event_registration"',
]:
    assert fragment in form, f"Main Event registration form is missing: {fragment}"

admin = (ROOT / "src" / "AdminRegisteredMembers.tsx").read_text(encoding="utf-8")
for fragment in ['rpc("admin_list_member_registrations")', 'rpc("admin_review_member_registration"', '"approve"', '"reject"', "team_vision", "team_long_term_target"]:
    assert fragment in admin, f"Registered Member review is missing: {fragment}"

team_inbox = (ROOT / "src" / "TeamDriverApplications.tsx").read_text(encoding="utf-8")
assert 'rpc("team_list_driver_applications")' in team_inbox

app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
for route in ['/main-event/registration', '/admin/registered-members', '/team-panel/driver-registration']:
    assert route in app, f"Missing registration route: {route}"

navigation = (ROOT / "src" / "PanelPages.tsx").read_text(encoding="utf-8")
assert 'path: "registration", label: "Registration"' in navigation

print("Main Event registration regression checks passed.")
