/**
 * Page-specific official CALE artwork.
 * Presentation mapping only: CALE behavior, outfit resolution and page guides
 * remain owned by the existing assistant and manifest.
 */
const owner = (name: string) => `/assets/cale/${name}`;
const driver = (name: string) => `/assets/cale/${name}`;
const fia = (name: string) => `/assets/cale/${name}`;

const PAGE_AVATARS: Record<string, string> = {
  "/": owner("sheet01_mascot01.webp"),
  "/about-us": owner("sheet01_mascot07.webp"),
  "/paddock-access": owner("sheet01_mascot05.webp"),
  "/dashboard": owner("sheet02_mascot02.webp"),
  "/community": owner("sheet02_mascot08.webp"),
  "/shop": owner("sheet04_mascot03.webp"),
  "/economy-guide": owner("sheet04_mascot06.webp"),
  "/financial-centre": owner("sheet05_mascot02.webp"),
  "/race-checkin": driver("04-helmet.webp"),
  "/rules": fia("sheet07_mascot02.webp"),
  "/profile": owner("sheet01_mascot03.webp"),
  "/account/settings": owner("sheet02_mascot04.webp"),
  "/auth/callback": owner("sheet01_mascot05.webp"),
  "/privacy-policy": owner("sheet04_mascot01.webp"),
  "/terms-and-conditions": owner("sheet04_mascot02.webp"),
  "/main-event/circuit-pool": driver("03-pointing.webp"),
  "/main-event/job-search": owner("sheet05_mascot06.webp"),
  "/main-event/take-over": owner("sheet04_mascot08.webp"),
  "/main-event/transfer-market": owner("sheet05_mascot08.webp"),
  "/main-event/registration": owner("sheet01_mascot06.webp"),
  "/fia-panel/circuit-pool-input": fia("sheet07_mascot01.webp"),
  "/fia-panel/event-control": fia("sheet07_mascot02.webp"),
  "/fia-panel/season-calendar": fia("sheet07_mascot03.webp"),
  "/fia-panel/race-input": fia("sheet07_mascot04.webp"),
  "/fia-panel/rules-input": fia("sheet07_mascot02.webp"),
  "/fia-panel/punishment-input": fia("sheet07_mascot03.webp"),
  "/fia-panel/appeal-room": fia("sheet07_mascot04.webp"),
  "/fia-panel/announcement-input": fia("sheet07_mascot01.webp"),
  "/fia-panel/discord-broadcast": fia("sheet07_mascot02.webp"),
  "/fia-panel/team-hq-config": fia("sheet07_mascot03.webp"),
  "/admin-workflow": fia("sheet07_mascot01.webp"),
  "/admin": fia("sheet07_mascot02.webp"),
  "/admin/users": fia("sheet07_mascot03.webp"),
  "/admin/configuration": fia("sheet07_mascot04.webp"),
  "/admin/prizepool": fia("sheet07_mascot01.webp"),
  "/admin/license-engine": fia("sheet07_mascot02.webp"),
  "/admin/economy-engine": fia("sheet07_mascot03.webp"),
  "/admin/adjustments": fia("sheet07_mascot04.webp"),
  "/admin/data-adjustments": fia("sheet07_mascot01.webp"),
  "/admin/quest-engine": fia("sheet07_mascot02.webp"),
  "/admin/pricing": fia("sheet07_mascot03.webp"),
  "/admin/operations": fia("sheet07_mascot04.webp"),
  "/admin/operations-intelligence": fia("sheet07_mascot01.webp"),
  "/admin/race-engine-lab": fia("sheet07_mascot02.webp"),
  "/admin/live-race": fia("sheet07_mascot03.webp"),
  "/admin/brand-ecosystem": fia("sheet07_mascot04.webp"),
  "/admin/sponsorship": fia("sheet07_mascot01.webp"),
  "/admin/test-personas": fia("sheet07_mascot02.webp"),
  "/admin/team-inactivity": fia("sheet07_mascot03.webp"),
  "/admin/developer-api": fia("sheet07_mascot04.webp"),
  "/admin/registered-members": fia("sheet07_mascot01.webp"),
};

const DRIVER_PAGE_AVATARS: Record<string, string> = {
  character: driver("01-arms-crossed.webp"),
  development: driver("08-tablet.webp"),
  training: driver("07-headset.webp"),
  "daily-checkin": driver("05-heart.webp"),
  quest: driver("03-pointing.webp"),
  "career-history": driver("02-victory.webp"),
  "financial-centre": driver("08-tablet.webp"),
  appeal: driver("01-arms-crossed.webp"),
};

const TEAM_PAGE_AVATARS: Record<string, string> = {
  "team-summary": owner("sheet02_mascot01.webp"),
  "custom-livery": owner("sheet04_mascot05.webp"),
  "team-hq": owner("sheet02_mascot06.webp"),
  "command-center": owner("sheet05_mascot04.webp"),
  "financial-centre": owner("sheet05_mascot02.webp"),
  development: owner("sheet04_mascot07.webp"),
  sponsorship: owner("sheet05_mascot06.webp"),
  "driver-contracts": owner("sheet02_mascot03.webp"),
  quest: owner("sheet01_mascot08.webp"),
  "driver-registration": owner("sheet01_mascot06.webp"),
  scout: owner("sheet05_mascot08.webp"),
  "place-job-advert": owner("sheet04_mascot08.webp"),
  "affiliate-team": owner("sheet05_mascot09.webp"),
  "engine-market": owner("sheet06_mascot02.webp"),
  appeal: owner("sheet02_mascot04.webp"),
};

const MAIN_EVENT_AVATARS: Record<string, string> = {
  "caleris-premio": driver("03-pointing.webp"),
  "caleris-zwei": driver("03-pointing.webp"),
  global: driver("03-pointing.webp"),
  "driver-ranking": driver("02-victory.webp"),
  "team-ranking": owner("sheet05_mascot09.webp"),
  "engine-ranking": owner("sheet06_mascot02.webp"),
  "driver-list": driver("01-arms-crossed.webp"),
  "team-list": owner("sheet02_mascot01.webp"),
  "transfer-market": owner("sheet05_mascot08.webp"),
  "job-search": owner("sheet05_mascot06.webp"),
  "take-over": owner("sheet04_mascot08.webp"),
  "circuit-pool": driver("03-pointing.webp"),
  "hall-of-fame": driver("06-trophy.webp"),
};

export function resolveCalePageAvatar(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const exact = PAGE_AVATARS[path];
  if (exact) return exact;

  const parts = path.split("/").filter(Boolean);
  const group = parts[0] ?? "";
  const slug = parts[1] ?? "";

  if (group === "fia-panel" || group === "admin") return fia("sheet07_mascot01.webp");
  if (group === "driver-panel") return DRIVER_PAGE_AVATARS[slug] ?? driver("01-arms-crossed.webp");
  if (group === "team-panel") return TEAM_PAGE_AVATARS[slug] ?? owner("sheet02_mascot01.webp");
  if (group === "main-event") return MAIN_EVENT_AVATARS[slug] ?? driver("03-pointing.webp");
  if (group === "member" || group === "member-id") return owner("sheet01_mascot03.webp");
  if (group === "team") return owner("sheet02_mascot01.webp");
  if (group === "quests") return owner("sheet01_mascot08.webp");
  if (path.includes("warning") || path.includes("punishment") || path.includes("appeal")) return fia("sheet07_mascot04.webp");
  if (path.includes("race") || path.includes("circuit")) return driver("04-helmet.webp");
  return owner("sheet01_mascot01.webp");
}
