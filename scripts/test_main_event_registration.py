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
v2_only = MIGRATIONS / "20261116222000_main_event_registration_v2_only.sql"
engine_season = MIGRATIONS / "20261116223000_assign_owned_engines_on_season_activation.sql"
assert owner_engine.is_file(), "Missing Team Owner engine/division migration"
assert admin_engine_details.is_file(), "Missing Admin engine detail migration"
assert v2_only.is_file(), "Missing legacy RPC restriction migration"
assert engine_season.is_file(), "Missing engine season activation migration"

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

form = (ROOT / "src" / "PaddockRoleDetails.tsx").read_text(encoding="utf-8")
for fragment in [
    "STEP 02 / 02",
    "driver_number_preference",
    "preferred_team_id",
    "driver_epithet",
    "team_base_nation",
    "team_long_term_target",
    "optimizeImageToWebp",
    "list_main_event_engine_marketplace",
]:
    assert fragment in form, f"Role-specific Paddock Access form is missing: {fragment}"

admin = (ROOT / "src" / "AdminRegisteredMembers.tsx").read_text(encoding="utf-8")
for fragment in ['rpc("admin_list_member_registrations_v2")', 'rpc("admin_review_main_event_registration_v2"', '"approve"', '"reject"', "team_vision", "team_long_term_target"]:
    assert fragment in admin, f"Registered Member review is missing: {fragment}"

team_inbox = (ROOT / "src" / "TeamDriverApplications.tsx").read_text(encoding="utf-8")
assert 'rpc("team_list_driver_applications")' in team_inbox

app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
for route in ['/main-event/registration', '/admin/registered-members', '/team-panel/driver-registration', '/team-panel/engine-market']:
    assert route in app, f"Missing registration route: {route}"

navigation = (ROOT / "src" / "PanelPages.tsx").read_text(encoding="utf-8")
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
v2_only_sql = v2_only.read_text(encoding="utf-8").lower()
assert "revoke all on function public.submit_main_event_registration(jsonb)" in v2_only_sql
assert "revoke all on function public.admin_review_member_registration(uuid,text,text)" in v2_only_sql
engine_season_sql = engine_season.read_text(encoding="utf-8").lower()
assert "caleris_assign_owned_engines_on_season_activation" in engine_season_sql
assert "distinct on (e.owner_team_id)" in engine_season_sql

engine_market = (ROOT / "src" / "TeamEngineMarket.tsx").read_text(encoding="utf-8")
for fragment in ['rpc("team_list_owned_engines")', 'rpc("list_main_event_engine_marketplace")', 'rpc("team_purchase_engine_usage"', "race_pace", "qualifying_pace", "engine_power"]:
    assert fragment in engine_market, f"Shared Team Engine Market is missing: {fragment}"
admin_market = (ROOT / "src" / "AdminEngineMarket.tsx").read_text(encoding="utf-8")
for fragment in ['rpc("admin_list_engine_marketplace")', 'rpc("admin_configure_engine_usage_offer"', "5000000", "25000000"]:
    assert fragment in admin_market, f"Admin Engine Market pricing control is missing: {fragment}"
shared_engine_sql = (MIGRATIONS / "20261120010000_shared_engine_usage_market.sql").read_text(encoding="utf-8").lower()
for fragment in ["race_pace", "qualifying_pace", "engine_power", "team_purchase_engine_usage", "admin_configure_engine_usage_offer", "on conflict(season_id,team_id) do update", "owner_team_id"]:
    assert fragment in shared_engine_sql, f"Shared Engine usage migration is missing: {fragment}"

print("Main Event registration regression checks passed.")

brand_migration = MIGRATIONS / "20261118120000_team_brand_identity.sql"
assert brand_migration.is_file(), "Missing persistent team brand identity migration"
brand_sql = brand_migration.read_text(encoding="utf-8").lower()
for fragment in [
    "add column if not exists main_color",
    "add column if not exists secondary_color",
    "team_main_color",
    "team_secondary_color",
    "main_color=v_main_color",
    "secondary_color=v_secondary_color",
    "v_registration.main_color",
    "v_registration.secondary_color",
    "'main_color',r.main_color",
    "'secondary_color',r.secondary_color",
    "create or replace view public.caleris_team_directory",
]:
    assert fragment in brand_sql, f"Team brand identity migration is missing: {fragment}"

brand_form = (ROOT / "src" / "PaddockRoleDetails.tsx").read_text(encoding="utf-8")
for fragment in ["TeamBrandColorPicker", "team_main_color:mainColor", "team_secondary_color:secondaryColor", "Main Color", "Secondary Color"]:
    assert fragment in brand_form, f"Paddock Access team brand controls are missing: {fragment}"

palette = (ROOT / "src" / "lib" / "teamColorPalette.ts").read_text(encoding="utf-8")
assert "hueFamilies" in palette and "Caleris Classics" in palette and "length:13" in palette
picker = (ROOT / "src" / "TeamBrandColorPicker.tsx").read_text(encoding="utf-8")
assert "TEAM_COLOR_GROUPS" in picker and "onChange(color)" in picker

driver = (ROOT / "src" / "DriverExhibition.tsx").read_text(encoding="utf-8")
for fragment in ['useState<"cards" | "3d">("cards")', 'if (viewMode !== "3d") return;', "driver-graphic-card", "driver-card-detail-stats"]:
    assert fragment in driver, f"Driver directory view is missing: {fragment}"
assert 'viewMode === "cards"' in driver, "Cards mode must be the default directory view"

print("Team brand identity and lightweight driver directory regression checks passed.")
