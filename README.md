# CALERIS MASTERS

**CALERIS MASTERS** is a Motorsport Roleplay web platform for its members, teams, and administrators. The project is maintained in the `Morepp461/Kunam` repository and deployed through Vercel, with Supabase providing authentication, database, storage, and Edge Function services.

## Technology Stack

- React 19
- TypeScript
- Vite
- React Router
- Supabase Auth, PostgreSQL, Storage, and Edge Functions
- Vercel
- Cloudflare Turnstile for Paddock Access verification

## Implemented Features

### Website and UI

- CALERIS MASTERS landing page with its established visual identity, logo, and cinematic background.
- Shared site layout, responsive styling, and reduced-motion support.
- Global click interaction, tire-track click trail, shared loading indicator, and charcoal liquid-glass toast notifications with gold accents.
- Discord OAuth sign-in through Supabase Auth.
- Rules page with an admin editor supporting draft and publish states.
- Admin-managed Discord community invite URL.

### Member Experience and Search

- Member profile and account navigation foundations.
- Global search with live autocomplete suggestions.
- Search categories:
  - Members, including public member ID, names, and nicknames.
  - Teams and their linked member profiles.
  - Published pages/content.
  - Local page shortcuts and card headings.
- Search suggestions are displayed while typing; the directory lookup is handled by the `member-directory` Supabase Edge Function.
- Search service permissions are granted to `service_role`; public and authenticated table access is not broadened by that grant.

### Paddock Access and Security

- Paddock Access onboarding for new Discord sign-ins before member pages are available.
- Server-side Cloudflare Turnstile token verification through the `complete-paddock-access` Edge Function.
- Supabase Row Level Security policies for public content and admin-only content are managed through migrations.
- Private profile avatar storage foundation.
- Admin bootstrap and member identity/member ID database support.

### Footer and Legal Pages

- Three-column CALERIS footer adapted from the VML reference layout.
- CALERIS MASTERS logo and platform description.
- Vreeo logo and Vreeo description.
- **DIRECTOR OF VREEO.ID** list with clickable Instagram links for:
  - Muhammad Ovella
  - Agung Pradana
  - Muhammad Alfarel
  - Liam Amir
  - Suhanda Arbawi
- Community & Support links for Vreeo Socialbuzz and Discord.
- No partnership or Official Partners section is displayed in the CALERIS footer.
- Legal page routes are available:
  - `/privacy-policy` — Kebijakan Privasi
  - `/terms-and-conditions` — Syarat & Ketentuan
- The legal pages are intentionally empty placeholders until the website is finalized and their content is prepared.

## Supabase

Supabase project schema is managed by the versioned SQL files in `supabase/migrations/`. Keep migrations in sync with the `main` branch and the connected Supabase project.

The current database implementation includes migrations for:

- Member dashboard profiles and profile identity.
- Paddock Access onboarding fields and access policies.
- Primary administrator bootstrap.
- Private profile avatar storage.
- Public member directory and member ID management.
- RLS policy separation for public content and administrator lookup.
- Server-side search read permissions for `service_role`.

Relevant Edge Functions include:

- `complete-paddock-access` — validates Paddock Access submissions and Turnstile tokens.
- `member-directory` — serves member, team, and page search requests.

### Authentication and Access Configuration

- Discord OAuth callback: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
- Configure the Discord provider, Site URL, and redirect allow-list in Supabase Auth.
- Configure `TURNSTILE_SECRET_KEY` in Supabase Edge Function secrets.
- The Turnstile public site key belongs in `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY`.
- Never expose Supabase secret/service-role keys, Discord client secrets, or Turnstile secret keys in browser environment variables.

## Environment Variables

Copy `.env.example` to `.env.local` and configure the required values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY`

Configure provider credentials and server-only secrets in their respective Supabase settings, not in client-side variables.

## Development

```bash
npm install
npm run dev
npm run check
npm run build
python3 -B scripts/validate.py
```

## Quality Checks and Deployment

- GitHub Actions workflow: **Caleris CI**.
- CI checks dependency installation, a report-only dependency security audit, TypeScript/application checks, production build, and project validation script.
- Changes are developed on a dedicated branch and merged into `main` only after CI passes.
- Vercel deploys the production application from `main`.
- Supabase database changes must be represented by versioned migrations and applied to the connected project.

## Panel Structure

The authenticated workspace now includes four additional navigation groups with dedicated route structures:

- **Main Event**: Global, Caleris Premio, Caleris Zwei, Transfer Market, FIA Announcement, Job Search, Take Over, Circuit Pool, and Regulation.
- **Driver Panel**: Character, Development, Sponsorship, Quest, Career History, and Financial Centre.
- **Team Panel**: Team Summary, Development, Sponsorship, Driver Registration, Quest, Scout, Place Job Advert, Affiliate Team, and Appeal.
- **FIA Panel**: Rules Input, Announcement Input, Punishment Input, and Appeal Room.

Global, Premio, and Zwei overview pages have separate card destinations. Premio and Zwei place Calendar and Results before the shared competition cards. Selected ranking and statistics pages include chart layouts; Transfer Market, Job Search, Take Over, Driver List, and Team List include directory/table structures and filter controls.

Driver and team development pages include the requested attribute lists with a 50–100 value range. Team Summary documents a configuration-driven season timeline; race-period calendar counts and phase durations are not hardcoded.

**Implementation status:** this is a UI/navigation scaffold only. Lists, charts, forms, sponsorship progress, quests, financial records, appeals, and FIA publication workflows do not yet read or write production data. No database schema or Supabase migration was added in this phase. Existing landing, account, profile, rules, and admin routes remain in place.

## Panel Role Access

Panel navigation and routes use the assigned role on the linked member record, not the self-selected `preferred_role` onboarding field.

- **Admin** (verified through `site_admins`): full access to Main Event, Driver Panel, Team Panel, and FIA Panel, including every FIA workspace route.
- **FIA** (`members.role = 'FIA'`): Main Event and FIA Panel.
- **Driver** (`members.role = 'Driver'`): Main Event and Driver Panel.
- **Owner / Principal** (`members.role = 'Owner'` or `'Principal'`): Main Event and Team Panel.
- **Agent**: Main Event only until its panel permissions are defined.
- **Journalist** is a legacy role and is excluded from the current CALERIS role constraint.

The client loads the signed-in user's linked member role through the existing RLS-protected `profiles` and `members` records. Navigation entries are filtered by the resulting access map, and protected panel routes redirect unauthorized sessions to the dashboard. Admin status is determined only by the `site_admins` table; the profile's `account_status` and `preferred_role` are not treated as authorization grants.

The current schema does not allow authenticated users to update `profiles.member_id` or write `members.role`; role assignment remains an administrator-controlled operation. Current panel pages are UI scaffolds, so future panel data tables and write workflows must receive matching server-side RLS policies before their data operations are enabled.

**Database:** no schema change or migration was required for this access-control phase; it reuses the existing member-role relation and RLS policies.


## Operations Suite · Configurable Modules

The Admin Control → Operations Suite workspace is introduced at `/admin/operations`. It provides editable records for:

- **Tax Rules:** Admin-configurable Wealth Tax thresholds and rates using flat calculation only, plus Driver Transfer Tax rules. The highest eligible threshold selects one rate applied to the full taxable base. No tax thresholds or rates are preloaded. Wealth Tax assessment and collection remain disabled until the taxable-wealth basis is confirmed.
- **Race Development Rewards:** per-season-division settings for winner and pole-sitter DDP awards and their respective teams' TDP awards. DDP/TDP use separate immutable development-token ledgers and never affect ¢p wallets. Values start at zero and inactive.
- **Sponsor Pool:** Admin-managed sponsor records and optional budgets. Sponsor names and commercial terms are not invented or preloaded.
- **Team Valuation:** Admin-entered component snapshots for assets, development parts, history, achievements, and financial health. Total valuation is the sum of those entered component values; no hidden weights are applied.

The database foundation also introduces operational records for sponsorship offers/contracts/targets/progress/story events, driver transfer and loan negotiations, team affiliations, team takeovers, FIA fines, and all-role race check-ins. Their tables use RLS and do not allow direct client writes. They require their validated member/FIA/Admin workflows before they can be treated as live features.

### Operations database migrations

- `20261112184424_caleris_operations_suite_foundation.sql` — operations tables, token ledgers, sponsor pool, tax rules, wealth assessments, transfer/takeover records, affiliations, valuation snapshots, fines, and member race check-ins.
- `20261112184428_caleris_operations_admin_policies.sql` — Admin-only write policies for editable tax rules, race reward settings, sponsor pool, and valuation snapshots.
- `20261112184433_caleris_operations_workflows.sql` — validated FIA race-result/DDP-TDP award, Wealth Tax assessment/collection guardrails (disabled pending taxable-base decision), and FIA fine posting workflows.
- `20261112184437_all_role_race_checkin.sql` — shared all-role race attendance, Driver-only license score integration, configurable reward payout, and pending reward processing.
- `20261112184440_wealth_tax_automatic_assessment.sql` — reserved migration; annual assessment is deferred until taxable-wealth basis is confirmed.
- `20261112184444_wealth_tax_offseason_scheduler.sql` — reserved migration; no cron job is installed while Wealth Tax basis remains undecided.
- `20261112184449_team_affiliation_workflows.sql` — cross-tier one-affiliate request, accept/reject, and termination RPCs.
- `20261112184453_admin_team_division_assignment.sql` — Admin assignment of team division keys used by affiliation validation.
- `20261112184457_driver_transfer_workflows.sql` — Driver negotiation, counter limits, FIA review, transfer tax, transfer-window queue, and scheduled execution.
- `20261113042000_driver_loan_full_season_payroll_and_return.sql` — affiliate-only one-season Driver Loan, fee settlement, automatic return, and split payroll ledger.
- `20261112184502_operations_negotiation_configuration.sql` — editable negotiation limits and takeover valuation bounds seeded from the explicitly agreed rules.
- `20261112185030_team_takeover_workflows.sql` — team listing, valuation-bounded negotiation, counter offers, and FIA review.
- `20261112185035_sponsorship_lifecycle_workflows.sql` — sponsor offers, counter history, contract acceptance, targets, progress, story events, and Sponsor Source payouts.
- `20261112185431_operations_market_directories.sql` — authenticated, read-only safe directory views for Driver/Team marketplaces and FIA lists; private member balance and member-code columns remain hidden.
- `20261112185541_team_takeover_market_valuation.sql` — exposes the latest valuation only for teams that have opened a Take Over listing.
- `20261112185752_sponsorship_story_visibility_hardening.sql` — enforces Admin-only, participant-only, and public storyline visibility boundaries.
- `20261112190047_member_directory_public_ids.sql` — adds public Member ID lookup to the safe directory for the profile-level Recruit action.
- `20261112190320_takeover_listing_valuation_guard.sql` — prevents opening a Take Over listing without an Admin valuation snapshot.

### Operational workflows added in this phase

- **All-role race check-in:** Dashboard and Driver Panel check-in routes now use one shared race check-in workflow for every member role. The existing Driver license trigger remains the only source of race attendance license points. Reward amount comes from the editable Economy configuration key `daily-checkin-reward`; pending all-role rewards can be processed from Admin → Economy Engine.
- **DDP / TDP:** FIA can enter the official winner and pole sitter after a round closes. The active season-division reward rule issues DDP to the relevant Driver only and TDP to each relevant Driver's team. The two token assets have independent immutable ledgers and wallet views in Driver Development and Team Development.
- **Wealth Tax:** Member and Team have separate taxable bases and independent sets of exactly three Admin-configurable flat-rate tiers. The highest threshold exceeded selects one rate for the full balance; the calculation is not progressive. Admin runs assessment and collection manually per season.
- **FIA fines:** FIA/Admin can issue a fine against a member or team. The workflow posts the debit and VreeoBank credit atomically through the existing immutable economy ledger.
- **Driver Transfer:** Team Owner/Principal can submit Transfer or Loan proposals, counter-offer, accept, or reject. The negotiation limits are editable in Configuration Center under **Driver Move Negotiation Limits**. Permanent transfers require FIA approval, the configured Driver Transfer Tax rule, sufficient buyer Team Wallet funds, and the End Season/Off Season window. Approved transfers queue until the window opens; a scheduled database job retries execution. On execution, the Driver moves to the buyer team and the seller's active season payroll contract is ended. Driver Loan is restricted to accepted affiliate teams and lasts one full configured season. The negotiated fee is paid from the borrowing Team Wallet to the origin Team Wallet when the loan activates on its start date after FIA approval. The Driver temporarily joins the borrowing team, then automatically returns to the origin team the day after the inclusive loan end date. The agreed borrowing-team salary share is selected from 0–100% in 10% increments; the origin team pays the remainder, so the Driver still receives 100% of the contracted salary. Payroll is split into separate immutable payroll ledger transactions for both teams at the end of each Race Period. Insufficient balances leave the whole payroll claim pending; Admin can retry it after funding. A loan cannot be activated late after its full-season window has expired.
- **Team affiliation:** Owner/Principal can request, accept, reject, or terminate an affiliation. Teams must have Admin-assigned division keys from License Scoring Engine, must be in different tiers, and each team can have only one pending/accepted affiliate relationship.
- **Team Take Over:** Only the Team Owner can list a team. Public Member, Driver, or FIA may submit an offer, negotiate directly with the seller, and accept/counter/reject offers; Team Owner and Principal cannot act as buyers. After FIA approval, one atomic database transaction pays from the buyer's personal wallet (Driver wallet for Driver; Public Member wallet for Public Member/FIA) to the seller's Team Owner wallet, changes the buyer's role to Owner, releases the former Owner to Public Member with no team, closes the listing, and records the ledger transaction. An FIA buyer becomes Owner and loses the FIA role; Admin membership remains separately governed by site_admins. Valuation range and negotiation limits remain editable in Configuration Center.
- Team Take Over database migrations: `20261113040440_team_takeover_settlement_and_role_transfer.sql`, `20261113040627_team_takeover_null_safe_role_guards.sql`, and `20261113040857_team_takeover_driver_contract_closeout.sql`. When the buyer is a Driver, their active Driver payroll contracts end as part of the role change; already-created pending payroll claims remain payable.
- **Sponsorship:** Admin can create sponsor offers; members can accept, reject, or counter; Admin can respond to counters, create contracts and targets, record progress, publish storyline events, and pay contract/bonus amounts from Sponsor Source. Payouts reduce the sponsor's editable budget and use the existing economy ledger.

### Admin entry points

- `/admin/operations` — editable tax rules, DDP/TDP reward rules, Sponsor Pool, team division mapping, and team valuation snapshots.
- `/admin/sponsorship` — sponsor offers, negotiations, contracts, targets, progress, storyline, and payout management.
- `/fia-panel/punishment-input` — FIA race result entry, Driver transfer review, Team Take Over review, and fine issuance.
- `/main-event/transfer-market` — Driver transfer negotiation.
- `/main-event/take-over` — Team Take Over listing and negotiation.
- `/team-panel/affiliate-team` — cross-tier team affiliation.
- `/driver-panel/sponsorship` and `/team-panel/sponsorship` — member sponsorship centre.
- `/race-checkin` — all-role race attendance; also used by the Driver Panel check-in route.
- `/driver-panel/development` and `/team-panel/development` — DDP and TDP wallets.

**Activation boundary:** the Operations Suite is deliberately configuration-first. Wealth Tax is charged only when Admin configures the three tiers for both scopes and runs assessment/collection. Transfer tax is not collected, sponsorship payout and race development token awards follow their configured workflows. Team Take Over payment and ownership transfer execute immediately after FIA approval through the ledger. Purchase payment uses the buyer's personal wallet and the seller's Team Owner wallet, not the Team Wallet.

## Current Project Notes

- The footer and both legal routes are implemented; legal page copy is intentionally pending.
- The global search UI and server-side directory endpoint are implemented. Search results depend on records existing in the corresponding Supabase tables and being eligible for display.
- CALERIS MASTERS does not display partnership/Official Partners content.
- Existing landing cinematic motion and background assets are retained. The legacy `cinematic-motion.js` remains active for landing dust particles.


## Admin Configuration Foundation

The Admin Control navigation includes **Configuration Center** at `/admin/configuration`. It is restricted by the existing administrator session check and backed by dedicated Supabase tables. Its main heading uses the shared Audiowide page-title typography used by the other workspace headings.

Available configuration categories:

- **License** — create, edit, activate/deactivate, order, and archive configuration records for license tiers and their details.
- **Economy** — store configurable economic rules and values without seeding legacy amounts.
- **Roles** — store role metadata and policy configuration records.
- **Regulations** — store configurable regulation records.

Configuration details are entered through ordinary form controls. Admin can add as many detail fields as needed and choose short text, number, yes/no, or long text for each field. The application stores these values in the existing JSON payload internally, so the Admin never needs to write JSON. Each create, update, or delete is captured in an append-only revision table and can be reviewed in a human-readable detail view.

**Important implementation boundary:** this phase delivers the configuration management foundation and persistence. It does not yet apply license evaluations, salary payments, economy transactions, role-permission changes, or competition rules to operational workflows. Those engines are implemented in later phases and must consume these records server-side. No legacy numerical values are preloaded.

### Configuration database

- `public.caleris_configurations` stores the current configuration records by category and key.
- `public.caleris_configuration_revisions` stores immutable change snapshots.
- Both tables have RLS enabled. Only authenticated users listed in `site_admins` can read or modify current configurations; revision snapshots are Admin-readable and append-only. Anonymous, PUBLIC, and service-role table privileges are revoked. Authenticated users receive only the exact CRUD privileges needed by the Admin interface and revision trigger; RLS still restricts all rows to Admin.
- The legacy `Journalist` member role was removed from the role constraint. Existing role names retained: Driver, Principal, Owner, Agent, and FIA.
- Migrations: `20261112120938_caleris_configuration_foundation.sql` `20261112121143_caleris_configuration_fk_indexes.sql`, `20261112121349_restrict_caleris_configuration_table_grants.sql`, and `20261112121435_tighten_caleris_configuration_privileges.sql`.

## License Scoring Engine

License scoring is processed by Supabase triggers and immutable score-ledger transactions. All numeric scoring rules are stored in the License category of Configuration Center and remain editable.

- Daily check-in points and inactivity penalty settings are seeded from the supplied rules.
- Standings milestone records are independent, configurable entries. The engine reads all active scoring-milestone-* records; it does not contain threshold values in application logic.
- Premio and Zwei WDC settings are seeded inactive with zero points. Admin must set and activate each division's WDC value before finalization.
- Driver Panel → Daily Check-in is the only attendance source. One check-in is allowed per Jakarta calendar day.
- The five-race inactivity rule is processed from configured round check-in windows. A round with any daily check-in breaks the absence streak; every configured streak interval applies the configured penalty, floored at the driver's remaining seasonal score.
- Admin Control → License Scoring Engine manages seasons, divisions, driver registrations, round windows, cumulative standings, final standings, hiatus flags, round processing, and WDC finalization.
- WDC finalization requires an active season, every configured round closed, a complete final classification for all non-hiatus registered drivers, exactly one first-place entry, a unique highest final-points total, an active registered Driver champion, and an active positive WDC setting for that division. A unique database constraint prevents more than one WDC award per division-season.
- Seasonal points are scoped by season. WDC ledger points are permanent. Hiatus preserves the last-license snapshot and excludes the driver from inactivity and final classification.
- Final standings are locked after WDC finalization. Official results are entered by Admin because the current project has no external race-results feed.

Supabase migrations aligned to the production Supabase history: `20261112123648_license_scoring_engine.sql`, `20261112123731_license_wdc_finalization_validation.sql`, `20261112123814_license_driver_read_policies_and_milestone_validation.sql`, `20261112124122_license_round_processing_order.sql`, `20261112124242_license_offseason_hiatus_guard.sql`, `20261112125157_race_day_checkin_and_lifetime_wdc.sql`, and `20261112130133_wdc_highest_division_dynamic_points.sql`.

### Race-day attendance and lifetime WDC correction

- Attendance is per scheduled race, not daily. The check-in button is available only on the Jakarta calendar date of a configured round and only within that round's configured opening/closing time. A non-race day has no check-in button and is not counted as an absence.
- Each attendance row references one round. A driver can check in once per round, including separate rounds scheduled on different dates. Database triggers validate the race date, time window, active season/division registration, and Driver role.
- WDC recognition is lifetime and cross-season, but its score follows the driver's highest division title. The configured tier priority determines promotion: a Zwei champion receives the current Zwei WDC value; after winning Premio, the same single WDC score is replaced by the current Premio value, never added together. Lower/equal-tier titles do not downgrade or stack the score.
- The WDC score remains linked to the highest division achieved and automatically synchronizes when Admin changes that division's WDC points configuration. For example, changing Premio's configured value from 35 to 40 updates existing Premio WDC awards from 35 to 40, including awards from earlier seasons.
- Each member has one WDC ledger row across all seasons. Its award identity and original provenance remain protected; only the score value and highest-achievement metadata can be revised by the validated championship or configuration-sync database workflows. Seasonal scoring and inactivity calculations continue to exclude WDC points.
- Premio and Zwei tier priorities are stored in their WDC configuration payloads, not hardcoded into the scoring engine.
- Migration: `20261112130133_wdc_highest_division_dynamic_points.sql`.


## Economy Engine · Stage 4

**Status: merged into main, Supabase migrations applied, Economy Edge Function active, and Vercel production deployment READY.**

### Wallet entities
- Public Member wallet: one per authenticated profile.
- Driver wallet: created when a member receives the Driver role.
- Team Owner wallet: created when a member receives the Owner role.
- Team wallet: one per team.
- VreeoBank: central in-game treasury.
- Sponsor Source: external funding-clearing account, separate from VreeoBank.

Wallet creation is trigger-driven and idempotent. Driver and Team Owner wallets are permanent member financial records: changing a member's role never deactivates or deletes an existing role wallet, preserving its balance, ledger history, and any outstanding Cash Loan reference. When a member later receives the corresponding role again, the existing wallet is reused. The database rejects attempts to insert or update a Driver/Team Owner wallet as inactive. Existing members.balance is retained for compatibility but is no longer the authoritative source of money.

### Ledger and controls
- Every posted movement creates one immutable transaction and two equal ledger entries: source outflow and destination inflow.
- Balances are updated atomically under ordered wallet row locks.
- Idempotency keys prevent duplicate posting; reusing a key with different transaction data is rejected.
- Transactions and ledger entries cannot be edited or deleted. Corrections use a linked reversal transaction.
- Tax and fine debits may take the payer wallet below zero. Other outgoing payments require sufficient source balance.
- Check-in rewards, prizes, and generic Bank rewards must be paid by VreeoBank. Sponsor payouts and Bank funding use Sponsor Source. Tax and fines must be credited to VreeoBank.
- If VreeoBank cannot fund an enabled check-in reward, the check-in remains valid and its reward claim stays pending until Admin processes it after funds become available.

### Configuration and administration
- Admin-only Economy Engine page: wallet registry, VreeoBank and Sponsor Source balances, transaction posting, reversal, pending check-in rewards, and transaction history.
- Admin mutations pass through a JWT-verified Supabase Edge Function. It independently verifies the caller against site_admins; ledger mutation RPC execution is restricted to service_role, not authenticated clients.
- Daily check-in reward configuration is stored in caleris_configurations and audited by the existing configuration revision trigger.
- Initial check-in reward configuration is deliberately inactive with amount 0; no unapproved economy amount is assumed.
- Profile balances now read from wallet accounts instead of the legacy members.balance field.

### Wealth Tax Engine · Stage 5

- Wealth Tax has two independent categories: **Member** and **Team**. Each category has its own configurable thresholds and rates in caleris_tax_rules.tax_scope.
- The engine uses one flat rate: the single highest active threshold exceeded is selected, then applied to the entire taxable balance. It is not progressive. Threshold comparison is strict (balance greater than minimum_base).
- Member taxable wealth is the combined balance of the member's active Public Member, Driver, and Team Owner wallets, resolved through the profile-to-member link. Team taxable wealth is only the Team Wallet balance. Personal wallets and Team Wallets are never mixed.
- Admin can create, edit, and delete rules independently for Member and Team, generate a season snapshot, and collect assessed tax through the JWT-verified economy-engine Edge Function.
- Assessment snapshots are unique per season and target. Collection is split deterministically across a member's personal wallets, recorded as separate immutable economy transactions, and credited to VreeoBank. Collection checks aggregate available balance first and does not partially debit an assessment or create a negative wallet balance; insufficient assessments remain open for a later collection attempt.
- The collection detail table records each source wallet and ledger transaction. Both assessment and collection tables have RLS enabled and are readable only by Admin.
- No threshold values or rates are pre-seeded. Each category must have exactly three active tiers, with strictly increasing rates as thresholds rise. Admin configures both categories before generating an assessment; all threshold and rate values remain editable. Wealth Tax is run manually per season; no automatic offseason schedule is enabled.
- Race result confirmation continues to distribute **DDP/TDP only** according to the Admin-configured season-division rules. It does not pay ¢p.
- Migrations: 20261113034921_wealth_tax_scoped_assessment_ledger.sql, 20261113034952_wealth_tax_admin_gateway_permissions.sql, 20261113035234_wealth_tax_personal_wallet_aggregation_and_lock_order.sql, and 20261113035324_wealth_tax_exact_three_tier_validation.sql. Economy Engine Edge Function is deployed as version 3 with JWT verification enabled.

### Important boundary
This stage establishes the wallet, accounting, security, and check-in reward foundation. Sponsorship contracts, fines, and other game-specific amounts must be configured or specified before their payout rules are activated. Annual Driver salary and Race Period payroll rules are defined in the Season Calendar and Team Driver Contracts implementation. The wallet, service-gateway, and query-hardening migrations are applied to Supabase production. Migration `20261113033406_economy_member_wallets_permanent_across_role_changes.sql` restores any inactive member role wallets and enforces permanent Driver/Team Owner wallet availability across role changes. The repository migration filenames are aligned to the recorded Supabase versions. The query-hardening migration appears twice in the remote migration history because it was applied twice; both idempotent records are preserved as matching migration files so local and remote histories stay aligned. The economy-engine Edge Function is deployed ACTIVE with JWT verification enabled. Economy mutation RPCs are executable only by service_role; the Edge Function validates the caller and Admin allow-list before forwarding requests. Production Vercel deployment is READY and the application entry page returns HTTP 200.


## Season Calendar & Team Payroll

- FIA Panel exposes Season Calendar and License Scoring Engine. FIA can configure season operations, process rounds, and finalize WDC. Admin includes all FIA permissions; FIA does not receive Admin privileges, Admin Control, or Economy Engine access.
- FIA Panel → Season Calendar builds the complete season timeline in one form: exactly one Off Season, one Pre Season, one End Season, one or more Race Periods, and zero or more Break Race Periods.
- Each period has manually configured start and end dates. Race Periods and Break Race Periods can repeat; Off Season, Pre Season, and End Season are limited to one each per season.
- Each Race Period must contain 3–5 existing rounds for every division in that season. Every round must be assigned exactly once. Calendar creation and round assignments are atomic.
- Reschedule updates a period's dates and records an immutable calendar revision.
- Team Panel → Driver Contracts allows the Team Owner to set each Driver's annual salary for a season. The contract is team- and season-specific; no default salary is assumed.
- Payroll is calculated as annual salary divided by the actual number of Race Periods configured for that season. Two-decimal rounding differences are reconciled in the final Race Period so total season salary equals the contract amount.
- Payroll runs automatically after FIA/Admin processes the final round of a Race Period. Funds move directly from the matching Team Wallet to the Driver Wallet through the immutable double-entry ledger.
- Payroll cannot create a negative Team Wallet. If funds are insufficient, the payroll claim remains pending and Admin can process pending payroll after the Team Wallet is funded.
- A salary amount and team assignment are locked once payroll claims exist for that Driver in the season. Contract status can still be changed subject to the payroll lifecycle.
- Payroll transactions use the existing idempotency, wallet locking, ledger immutability, and reversal model. Reversing a payroll transaction marks its claim reversed; it is not silently paid again.

Migration: `20261112160305_season_calendar_and_payroll.sql`.


## Cash Loan Engine

- Member Financial Centre is available to every authenticated member at `/financial-centre`.
- Cash Loan eligibility is calculated from income already received during the active season. Eligible income event types include payroll, race check-in rewards, bank/quest rewards, and sponsorship payouts. Future sponsorship integration can feed the existing sponsor payout event type.
- Maximum principal is 5× the member's received season income. The income calculation reads immutable incoming ledger entries across wallets linked to the member.
- Only one unpaid Cash Loan may exist per member. A new application is blocked until the current loan is fully repaid.
- Total fixed interest is based on the selected calendar-season tenor:
  - 1 Season: 5%
  - 2 Seasons: 10%
  - 3 Seasons: 16%
  - 4 Seasons: 24%
- The application page previews the interest rate, interest amount, total repayment, and estimated Race Period installment count before submission.
- Loan disbursement moves funds from VreeoBank to the member's role wallet and records an immutable double-entry transaction.
- Repayments are attempted automatically after payroll at the final round of each Race Period. If the member wallet cannot cover the installment, the installment is marked overdue; it is retried at a later Race Period. Overdue loans block new applications.
- The cash-loan workflow uses a separate JWT-verified Edge Function. It verifies the authenticated member and calls service-role-only database functions; members cannot directly insert loans or execute the loan mutation RPCs.
- Database migrations: `20261112173057_economy_cash_loan_engine.sql` and `20261112173427_economy_cash_loan_indexes.sql`.
- Edge Function: `economy-workflows` (JWT verification enabled).
