from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PANEL = (ROOT / "src" / "PanelPages.tsx").read_text(encoding="utf-8")
ADMIN_USERS = (ROOT / "src" / "AdminUsers.tsx").read_text(encoding="utf-8")
TEAM_SUMMARY = (ROOT / "src" / "TeamSummary.tsx").read_text(encoding="utf-8")
ECOSYSTEM = (ROOT / "src" / "CalerisEcosystem.tsx").read_text(encoding="utf-8")

assert 'import { supabase } from "./lib/supabase";' in PANEL
assert 'import { MemberProfileLink, TeamProfileLink } from "./EntityProfileLink";' in PANEL
assert 'function LiveEntityDirectory({kind}:{kind:"drivers"|"teams"})' in PANEL
assert 'from("caleris_driver_market_directory").select("id,character_name,role,team_id,license,public_member_id")' in PANEL
assert 'from("caleris_team_directory").select("id,name,division_key")' in PANEL
assert '.eq("role","Driver")' in PANEL
assert '<MemberProfileLink memberId={driver.public_member_id}>' in PANEL
assert '<TeamProfileLink teamId={team.id}>' in PANEL
assert '<TeamProfileLink teamId={team.id}>{team.name}</TeamProfileLink>' in PANEL
assert 'detail==="driver-list"?<LiveEntityDirectory kind="drivers"/>' in PANEL
assert 'detail==="team-list"?<LiveEntityDirectory kind="teams"/>' in PANEL
assert 'memberId={driver.public_member_id}' in PANEL
assert 'Internal' not in PANEL
assert 'memberId={profile?.public_member_id}>{member?.character_name' in ADMIN_USERS
assert 'profile?.public_member_id || member?.id' not in ADMIN_USERS
assert 'TeamProfileLink teamId={team.id}' in TEAM_SUMMARY
assert 'MemberProfileLink memberId={driver.public_member_id}' in TEAM_SUMMARY
assert 'from("caleris_member_directory").select("id,character_name,public_member_id")' in ECOSYSTEM
assert 'from("caleris_member_directory").select("id,public_member_id")' in ECOSYSTEM
assert 'MemberProfileLink memberId={contract.public_member_id}' in ECOSYSTEM
assert 'MemberProfileLink memberId={entry.public_member_id}' in ECOSYSTEM
assert 'MemberProfileLink memberId={row.public_member_id}' in ECOSYSTEM
assert 'MemberProfileLink memberId={x.public_member_id}' in ECOSYSTEM
assert 'TeamProfileLink teamId={x.team_id_snapshot}' in ECOSYSTEM
assert 'TeamProfileLink teamId={x.team_id}' in ECOSYSTEM
assert '<MemberProfileLink memberId={r.public_member_id}>#{i+1} {r.name}</MemberProfileLink>' in ECOSYSTEM
assert '<TeamProfileLink teamId={r.team_id}>#{i+1} {r.name}</TeamProfileLink>' in ECOSYSTEM
assert 'select("member_id,team_id,driver_name_snapshot,team_name_snapshot,finishing_position,fastest_lap_ms")' in ECOSYSTEM
assert 'MemberProfileLink memberId={contract.member_id}' not in ECOSYSTEM
assert 'MemberProfileLink memberId={entry.member_id}' not in ECOSYSTEM
assert 'MemberProfileLink memberId={row.member_id}' not in ECOSYSTEM
print("Live driver/team directories and public profile-link regression checks passed.")
