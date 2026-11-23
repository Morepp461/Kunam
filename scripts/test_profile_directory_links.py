from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PANEL = (ROOT / "src" / "PanelPages.tsx").read_text(encoding="utf-8")
ADMIN_USERS = (ROOT / "src" / "AdminUsers.tsx").read_text(encoding="utf-8")
TEAM_SUMMARY = (ROOT / "src" / "TeamSummary.tsx").read_text(encoding="utf-8")
ECOSYSTEM = (ROOT / "src" / "CalerisEcosystem.tsx").read_text(encoding="utf-8")
INACTIVITY = (ROOT / "src" / "AdminTeamInactivity.tsx").read_text(encoding="utf-8")
ENTITY_LINKS = (ROOT / "src" / "EntityProfileLink.tsx").read_text(encoding="utf-8")
ENGINE_MARKET = (ROOT / "src" / "TeamEngineMarket.tsx").read_text(encoding="utf-8")
TEAM_HQ = (ROOT / "src" / "TeamHQ.tsx").read_text(encoding="utf-8")
ADMIN_OPERATIONS = (ROOT / "src" / "AdminOperations.tsx").read_text(encoding="utf-8")

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
assert 'from("caleris_member_directory").select("id,character_name,public_member_id")' in INACTIVITY
assert '<MemberProfileLink memberId={memberMap.get(s.member_id)?.public_member_id}>' in INACTIVITY
assert '<MemberProfileLink memberId={s.member_id}>' not in INACTIVITY
assert '<TeamProfileLink teamId={engine.seller_team_id}>' in ENGINE_MARKET
assert '<TeamProfileLink teamId={team.id}>{team.name}</TeamProfileLink>' in ENGINE_MARKET
assert '<TeamProfileLink teamId={team.id}>{team.name}</TeamProfileLink>' in TEAM_HQ
assert '<TeamProfileLink teamId={t.id}>{t.name}</TeamProfileLink>' in ADMIN_OPERATIONS
assert '<TeamProfileLink teamId={v.team_id}>{v.team?.name||"Team"}</TeamProfileLink>' in ADMIN_OPERATIONS
assert 'const PUBLIC_MEMBER_ID=/^[A-Z0-9]{12,16}$/;' in ENTITY_LINKS
assert 'if(!PUBLIC_MEMBER_ID.test(publicId))return <>{children}</>;' in ENTITY_LINKS
assert 'const TEAM_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;' in ENTITY_LINKS
assert 'if(!TEAM_ID.test(id))return <>{children}</>;' in ENTITY_LINKS
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
FIA_OPERATIONS = (ROOT / "src" / "FIAOperations.tsx").read_text(encoding="utf-8")
COMMUNITY = (ROOT / "src" / "CommunityProgression.tsx").read_text(encoding="utf-8")
DRIVER_EXHIBITION = (ROOT / "src" / "DriverExhibition.tsx").read_text(encoding="utf-8")
TEAM_CONTRACTS = (ROOT / "src" / "TeamDriverContracts.tsx").read_text(encoding="utf-8")
TEAM_APPLICATIONS = (ROOT / "src" / "TeamDriverApplications.tsx").read_text(encoding="utf-8")
TEAM_AFFILIATE = (ROOT / "src" / "TeamAffiliate.tsx").read_text(encoding="utf-8")
TEAM_TAKEOVER = (ROOT / "src" / "TeamTakeoverMarket.tsx").read_text(encoding="utf-8")
ADMIN_PRIZEPOOL = (ROOT / "src" / "AdminPrizepool.tsx").read_text(encoding="utf-8")
ADMIN_ADJUSTMENTS = (ROOT / "src" / "AdminAdjustmentCenter.tsx").read_text(encoding="utf-8")
BRAND_ECOSYSTEM = (ROOT / "src" / "BrandEcosystem.tsx").read_text(encoding="utf-8")
BRAND_ECOSYSTEM_ADMIN = (ROOT / "src" / "BrandEcosystemAdmin.tsx").read_text(encoding="utf-8")

assert 'import {MemberProfileLink,TeamProfileLink} from "./EntityProfileLink";' in FIA_OPERATIONS
assert 'select("id,public_member_id,character_name,role,team_id")' in FIA_OPERATIONS
assert '<MemberProfileLink memberId={members.find(x=>x.id===m.driver_member_id)?.public_member_id}>' in FIA_OPERATIONS
assert '<TeamProfileLink teamId={m.buyer_team_id}>' in FIA_OPERATIONS
assert '<TeamProfileLink teamId={m.seller_team_id}>' in FIA_OPERATIONS
assert '<TeamProfileLink teamId={t.target_team_id}>' in FIA_OPERATIONS
assert '<MemberProfileLink memberId={members.find(x=>x.id===t.buyer_member_id)?.public_member_id}>' in FIA_OPERATIONS
assert '<MemberProfileLink memberId={members.find(x=>x.id===t.seller_member_id)?.public_member_id}>' in FIA_OPERATIONS
assert 'targetName=(f:Fine)=>f.target_kind==="member"?<MemberProfileLink' in FIA_OPERATIONS

assert 'import { MemberProfileLink, TeamProfileLink } from "./EntityProfileLink";' in COMMUNITY
assert 'db.from("caleris_member_directory").select("id,public_member_id,character_name").eq("role", "Driver")' in COMMUNITY
assert 'public_member_id: (() => { const matches = driverDirectory.filter' in COMMUNITY
assert 'row.public_member_id ? <MemberProfileLink memberId={row.public_member_id}>' in COMMUNITY
assert '<TeamProfileLink teamId={member.team_id}>' in COMMUNITY


assert 'import { MemberProfileLink, TeamProfileLink } from "./EntityProfileLink";' in DRIVER_EXHIBITION
assert '<MemberProfileLink memberId={selected.public_member_id}>{selected.character_name || "Driver"}</MemberProfileLink>' in DRIVER_EXHIBITION
assert '<TeamProfileLink teamId={selected.team?.id}>{selected.team?.name || "Independent"}</TeamProfileLink>' in DRIVER_EXHIBITION
assert '<strong><TeamProfileLink teamId={selected.team?.id}>{selected.team?.name || "Independent"}</TeamProfileLink></strong>' in DRIVER_EXHIBITION
assert '<h2><MemberProfileLink memberId={selected.public_member_id}>{selected.character_name || "Driver"}</MemberProfileLink></h2>' in DRIVER_EXHIBITION
assert '<TeamProfileLink teamId={member.team_id}>{teamName}</TeamProfileLink>' in COMMUNITY


assert '<TeamProfileLink teamId={selectedTeam.id}>{selectedTeam.name}</TeamProfileLink>' in TEAM_CONTRACTS
assert '<TeamProfileLink teamId={team?.id}>{team?.name||"Team"}</TeamProfileLink>' in TEAM_APPLICATIONS
assert 'const teamName=(id:string)=><TeamProfileLink teamId={id}>' in TEAM_AFFILIATE
assert '<TeamProfileLink teamId={ownTeam.id}>{ownTeam.name}</TeamProfileLink>' in TEAM_AFFILIATE
assert '<TeamProfileLink teamId={ownTeam.id}>{ownTeam.name}</TeamProfileLink>' in TEAM_TAKEOVER


assert '<TeamProfileLink teamId={s.team_id}>{teams.find(t=>t.id===s.team_id)?.name||"Team"}</TeamProfileLink>' in ADMIN_PRIZEPOOL
assert 'supabase.from("caleris_member_directory").select("id,public_member_id").eq("role","Driver")' in ADMIN_ADJUSTMENTS
assert '<MemberProfileLink memberId={drivers.find(d=>d.id===a.member_id)?.public_member_id}>' in ADMIN_ADJUSTMENTS
assert '<TeamProfileLink teamId={o.target_team_id||undefined}>{teams.find(t=>t.id===o.target_team_id)?.name||"Team"}</TeamProfileLink>' in BRAND_ECOSYSTEM
assert 'mode==="team"&&team?<TeamProfileLink teamId={team.id}>{team.name}</TeamProfileLink>' in BRAND_ECOSYSTEM
assert 'mode==="driver"&&member?.public_member_id?<MemberProfileLink memberId={member.public_member_id}>' in BRAND_ECOSYSTEM
assert 'const teamName=(id:string|null)=><TeamProfileLink teamId={id||undefined}>' in BRAND_ECOSYSTEM_ADMIN

print("Live driver/team directories, FIA operations, Community Hub and public profile-link regression checks passed.")
