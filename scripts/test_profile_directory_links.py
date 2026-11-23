from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PANEL = (ROOT / "src" / "PanelPages.tsx").read_text(encoding="utf-8")

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
print("Live driver/team directory data and public profile-link regression checks passed.")
