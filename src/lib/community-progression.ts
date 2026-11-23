export type PredictorDriver = { name: string; points: number };
export type PredictorResult = { probabilities: number[]; lockedChampionIndex: number | null; eliminated: boolean[]; maxRemainingPoints: number };

export function getCalerisLevel(totalXp: number): number {
  if (!Number.isFinite(totalXp) || totalXp <= 0) return 0;
  let currentLevel = 0;
  let threshold = 50;
  while (currentLevel < 100 && totalXp >= threshold) {
    currentLevel += 1;
    threshold *= 2;
  }
  return currentLevel;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function simulateChampionship(
  drivers: PredictorDriver[],
  eventVectors: number[][],
  trials = 15000,
  random: () => number = Math.random,
): PredictorResult {
  if (drivers.length < 2) throw new Error("Minimal dua driver diperlukan.");
  if (drivers.some((driver) => !driver.name.trim() || !Number.isFinite(driver.points) || driver.points < 0)) {
    throw new Error("Data driver atau poin tidak valid.");
  }
  if (eventVectors.some((vector) => !vector.length || vector.some((value) => !Number.isFinite(value) || value < 0))) {
    throw new Error("Aturan poin untuk salah satu ronde belum tersedia atau tidak valid.");
  }
  if (!Number.isInteger(trials) || trials < 1) throw new Error("Jumlah simulasi tidak valid.");

  const maxRemainingPoints = eventVectors.reduce((sum, vector) => sum + Math.max(0, ...vector), 0);
  const leaderPoints = Math.max(...drivers.map((driver) => driver.points));
  const leaders = drivers.map((driver, index) => driver.points === leaderPoints ? index : -1).filter((index) => index >= 0);
  const lockedChampionIndex = leaders.length === 1 && drivers.every((driver, index) =>
    index === leaders[0] || drivers[leaders[0]].points > driver.points + maxRemainingPoints
  ) ? leaders[0] : null;
  const eliminated = drivers.map((driver, index) => drivers.some((rival, rivalIndex) =>
    rivalIndex !== index && rival.points > driver.points + maxRemainingPoints
  ));

  if (lockedChampionIndex !== null) {
    return {
      probabilities: drivers.map((_, index) => index === lockedChampionIndex ? 100 : 0),
      lockedChampionIndex,
      eliminated,
      maxRemainingPoints,
    };
  }

  const wins = drivers.map(() => 0);
  for (let trial = 0; trial < trials; trial += 1) {
    const totals = drivers.map((driver) => driver.points);
    for (const vector of eventVectors) {
      const order = shuffle(drivers.map((_, index) => index), random);
      order.forEach((driverIndex, position) => {
        totals[driverIndex] += vector[position] ?? 0;
      });
    }
    const high = Math.max(...totals);
    const tied = totals.map((value, index) => value === high ? index : -1).filter((index) => index >= 0);
    const winner = tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
    wins[winner] += 1;
  }

  const probabilities = wins.map((count, index) => eliminated[index] ? 0 : count / trials * 100);
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  return {
    probabilities: total > 0 ? probabilities.map((value) => value / total * 100) : probabilities,
    lockedChampionIndex: null,
    eliminated,
    maxRemainingPoints,
  };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

const formatNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "-";
};

function tableRows(rows: any[], columns: { label: string; value: (row: any, index: number) => unknown }[]): string {
  if (!rows.length) return '<tr><td colspan="' + columns.length + '">Belum ada data resmi.</td></tr>';
  return rows.map((row, index) => "<tr>" + columns.map((column) => "<td>" + escapeHtml(column.value(row, index)) + "</td>").join("") + "</tr>").join("");
}

export function buildYearbookPrintHtml(snapshot: any): string {
  const season = snapshot?.season ?? {};
  const member = snapshot?.member ?? {};
  const official = snapshot?.official_season_data ?? {};
  const divisions = Array.isArray(official.divisions) ? official.divisions : [];
  const drivers = Array.isArray(official.driver_standings) ? official.driver_standings : [];
  const teams = Array.isArray(official.team_standings) ? official.team_standings : [];
  const rounds = Array.isArray(official.rounds) ? official.rounds : [];
  const results = Array.isArray(official.race_results) ? official.race_results : [];
  const badges = Array.isArray(snapshot?.badges) ? snapshot.badges : [];
  const activity = Array.isArray(snapshot?.activity) ? snapshot.activity : [];
  const title = escapeHtml(snapshot?.title ?? (season.title ? season.title + " Yearbook" : "CALERIS MASTERS Yearbook"));
  const memberName = escapeHtml(member.character_name ?? "CALERIS Member");
  const seasonName = escapeHtml(season.title ?? season.season_key ?? "Season");
  const divisionHtml = divisions.map((division: any) => "<span class='chip'>" + escapeHtml(division.division_name ?? division.name ?? "Division") + "</span>").join("");
  const driverHtml = tableRows(drivers, [
    { label: "Pos", value: (row, index) => row.final_position ?? row.position ?? index + 1 },
    { label: "Driver", value: (row) => row.driver_name_snapshot ?? row.character_name ?? row.member_name ?? "Driver" },
    { label: "Team", value: (row) => row.team_name_snapshot ?? row.team_name ?? "-" },
    { label: "Points", value: (row) => formatNumber(row.final_points ?? row.points_total ?? row.points) },
  ]);
  const teamHtml = tableRows(teams, [
    { label: "Pos", value: (row, index) => row.final_position ?? row.position ?? index + 1 },
    { label: "Team", value: (row) => row.team_name_snapshot ?? row.team_name ?? row.name ?? "Team" },
    { label: "Points", value: (row) => formatNumber(row.final_points ?? row.points_total ?? row.points) },
  ]);
  const roundHtml = tableRows(rounds, [
    { label: "Round", value: (row) => row.round_number ?? "-" },
    { label: "Event", value: (row) => row.title ?? row.circuit_name ?? "Race event" },
    { label: "Circuit", value: (row) => row.circuit_name ?? "-" },
    { label: "Status", value: (row) => row.race_lifecycle_status ?? row.status ?? "-" },
  ]);
  const resultHtml = tableRows(results, [
    { label: "Round", value: (row) => row.round_number ?? "-" },
    { label: "Driver", value: (row) => row.driver_name_snapshot ?? "Driver" },
    { label: "Team", value: (row) => row.team_name_snapshot ?? "-" },
    { label: "Finish", value: (row) => row.finishing_position ?? row.finish_status ?? "-" },
  ]);
  const badgeHtml = badges.length
    ? badges.map((badge: any) => "<article class='badge'><strong>" + escapeHtml(badge.title ?? badge.code) + "</strong><p>" + escapeHtml(badge.description ?? "") + "</p></article>").join("")
    : "<p>Belum ada achievement badge yang diperoleh.</p>";
  const activityHtml = activity.length
    ? activity.map((item: any) => "<li><strong>" + escapeHtml(item.title) + "</strong><span>" + escapeHtml(item.body) + "</span><small>" + escapeHtml(item.created_at ? new Date(item.created_at).toLocaleString("id-ID") : "") + "</small></li>").join("")
    : "<li>Belum ada aktivitas komunitas yang tersedia.</li>";
  const generatedAt = escapeHtml(snapshot?.generated_at ? new Date(snapshot.generated_at).toLocaleString("id-ID") : new Date().toLocaleString("id-ID"));
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px/1.55 Inter,Arial,sans-serif;color:#202020;margin:0;background:#fff}
.cover{min-height:245mm;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #b89a60;padding:18mm;page-break-after:always}
.eyebrow{letter-spacing:.18em;color:#8b6e37;font-size:10px;font-weight:700}.cover h1{font-size:42px;line-height:1.05;margin:18px 0}.cover h2{font-size:20px;font-weight:500;color:#555}
.meta{border-top:1px solid #ddd;padding-top:12px;color:#555}.section{page-break-inside:avoid;margin:0 0 22px}.section h2{font-size:19px;border-bottom:2px solid #b89a60;padding-bottom:7px;margin:24px 0 12px}
.chip{display:inline-block;border:1px solid #ddd;border-radius:20px;padding:4px 9px;margin:0 5px 5px 0;font-size:10px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stat{border:1px solid #ddd;padding:12px}.stat strong{display:block;font-size:22px}
table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}th{background:#f2eee5}
.badges{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.badge{border:1px solid #ddd;padding:10px}.badge p{margin:4px 0 0;color:#666}
ul{padding-left:18px}li{margin:8px 0}li span,li small{display:block;color:#555}footer{margin-top:28px;padding-top:8px;border-top:1px solid #ddd;color:#777;font-size:9px}
@media print{.no-print{display:none!important}}
</style></head><body>
<section class="cover"><div><div class="eyebrow">CALERIS MASTERS · OFFICIAL SEASON ARCHIVE</div><h1>${title}</h1><h2>${seasonName}</h2><p>Season record for <strong>${memberName}</strong></p>${divisionHtml}</div><div class="meta"><strong>LV ${escapeHtml(snapshot?.level ?? 0)} · ${formatNumber(snapshot?.xp ?? 0)} XP</strong><br>Generated ${generatedAt}</div></section>
<section class="section"><h2>Member Progress</h2><div class="stats"><div class="stat"><strong>LV ${escapeHtml(snapshot?.level ?? 0)}</strong>Account level</div><div class="stat"><strong>${formatNumber(snapshot?.xp ?? 0)}</strong>Cumulative XP</div><div class="stat"><strong>${badges.length}</strong>Earned badges</div></div></section>
<section class="section"><h2>Official Driver Standings</h2><table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Points</th></tr></thead><tbody>${driverHtml}</tbody></table></section>
<section class="section"><h2>Official Team Standings</h2><table><thead><tr><th>Pos</th><th>Team</th><th>Points</th></tr></thead><tbody>${teamHtml}</tbody></table></section>
<section class="section"><h2>Season Calendar</h2><table><thead><tr><th>Round</th><th>Event</th><th>Circuit</th><th>Status</th></tr></thead><tbody>${roundHtml}</tbody></table></section>
<section class="section"><h2>Race Results</h2><table><thead><tr><th>Round</th><th>Driver</th><th>Team</th><th>Finish</th></tr></thead><tbody>${resultHtml}</tbody></table></section>
<section class="section"><h2>Achievement Collection</h2><div class="badges">${badgeHtml}</div></section>
<section class="section"><h2>Community Activity</h2><ul>${activityHtml}</ul></section>
<footer>CALERIS MASTERS · Snapshot version ${escapeHtml(snapshot?.snapshot_version ?? 1)} · Generated ${generatedAt}. Official competition data is preserved from the server-side season snapshot.</footer>
<script>window.addEventListener("load",()=>{setTimeout(()=>window.print(),350)});</script></body></html>`;
}
