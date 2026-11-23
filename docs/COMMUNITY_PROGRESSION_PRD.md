# Community Progression Suite

## Scope
This feature set adds seven connected CALERIS Masters community systems:
1. Driver Career Milestones and Team Milestones.
2. Member Activity Feed.
3. Community Voting: Driver of the Period, Team of the Period, Driver of the Season, Team of the Season, and FIA nomination.
4. Championship Predictor with Monte Carlo estimates and mathematical clinch/elimination boundaries.
5. Custom Digital ID Card.
6. Season Yearbook Generator.
7. Achievement Badges and Account Leveling.

## XP and Level Rules
- XP is a cumulative ledger. It is never reset at level-up.
- LV0 starts below 50 XP.
- Cumulative thresholds: LV1 50; LV2 100; LV3 200; LV4 400; LV5 800; LV6 1,600; LV7 3,200; LV8 6,400; each next threshold doubles through LV100.
- XP source types: race result, check-in, quest, milestone, shop purchase, and admin adjustment.
- XP is idempotent per member/source type/source ID.
- XP amounts are configuration data, not hardcoded reward values. New installations seed all event rewards to zero until an Admin configures them.
- Race result, check-in, quest completion, and development shop purchase events feed the XP ledger through database triggers. The trigger source ID prevents duplicate awards.
- Award and milestone RPCs require service role or a registered site admin.

## Milestones
- Definitions are data-driven and scoped to driver or team.
- Progress is stored separately from definitions.
- Driver XP milestone targets follow the cumulative progression thresholds.
- Team milestone definitions and progress use team scope; only trusted server/admin operations may update progress.

## Activity Feed
- Activity rows contain actor, team, event type, title, body, metadata, visibility, and timestamp.
- Community events are readable by authenticated users; team/private visibility is restricted to the actor or associated team.
- XP, voting, race result, check-in, quest completion, and development purchase actions publish feed events. Race/check-in/quest/shop feed logging is independent of whether an XP reward is configured.
- Team milestone progress is automatically refreshed from race-result entries and current Driver roster counts; initial metric catalog covers race starts, wins, podiums, and active Driver line-up.

## Community Voting
- Each member may vote once per poll.
- Poll types are constrained to the four awards and FIA nomination.
- Polls are created through an Admin-only RPC with at least two member/team candidates.
- FIA nomination is a nomination workflow only. It never grants FIA role automatically; Admin review and assignment remain separate.

## Championship Predictor
- The Predictor can load current Driver standings, scheduled rounds, and active FIA scoring rules for a selected season. Manual inputs remain available for custom what-if scenarios.
- Sprint scoring and pole bonus values are read from active scoring-rule rows. Pole bonus is simulated independently from finishing position rather than being incorrectly added to the race winner.
- The current model assumes equal probability for each finishing order and pole winner. It does not claim to model driver/car pace, circuit effects, reliability, or Race Engine telemetry because those inputs are not yet verified as a complete model.
- Monte Carlo runs 15,000 trials.
- A driver is marked 100% only when the current leader has a strict mathematical lead over every rival's maximum remaining points; eliminated drivers are marked 0%.
- Tied mathematical boundaries are not treated as locked because the official tiebreaker chain is not currently included in this tool. Results are estimates, not official standings.

## Digital ID
- Member-owned card themes: Classic, Premio, Zwei, and Gold.
- Accent color and tagline are validated and saved through a member-scoped RPC.
- Public visibility is stored per member.
- Public verification is available at `/member-id/:memberCode` and returns only the public member identity, cumulative XP/level, completed milestones, and active earned badges when the card is explicitly public.
- The share URL is canonical and the QR code resolves to that verification page.

## Season Yearbook
- Each yearbook is scoped to a member and season.
- Generation stores a snapshot containing season metadata, profile, level, XP, earned badges, recent community activity, official Driver/Team final standings, divisions, scheduled rounds, race result entries, and active FIA scoring rules fetched through a server-side season-data RPC.
- Export opens a print-ready HTML yearbook from the authoritative server-side snapshot; users can save it as PDF through the browser print dialog.
- Snapshot data includes a version and generation timestamp; it does not invent missing historical data.

## Badges
- Badge definitions and member awards are stored separately.
- Community voting grants the Community Voice badge once per member and poll.
- Admin can create an immediately open poll or schedule a future start. Period awards must reference a period from the selected official season calendar; season awards must reference an official season. Poll records transition from scheduled to open when the first eligible vote arrives after the configured start time; voting is rejected outside the configured window.
- Admin can close and publish aggregate results; individual vote records remain private.
- Admin can configure reward XP per supported event source and maintain the badge catalog (title, description, icon key, rarity, and active state) through authorization-checked RPCs.
- Milestone badges are defined for the configured XP thresholds.

## Security and Data
- RLS is enabled on all new feature tables.
- XP and milestone writes are server/admin restricted.
- Voting and ID persistence use security-definer RPCs with explicit identity and scope validation.
- Yearbooks are isolated by member and season.
- Vote visibility is restricted to the voter's own record; aggregate results are exposed separately after the poll is closed or its end time has passed.
- Internal trigger helpers are not executable by anon/authenticated roles. The public Digital ID RPC is intentionally callable by anon, but returns only fields guarded by the member's public visibility setting.

## Route
- Authenticated member route: `/community`.
- Entry point: member sidebar Quick Access.
