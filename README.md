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

## Current Project Notes

- The footer and both legal routes are implemented; legal page copy is intentionally pending.
- The global search UI and server-side directory endpoint are implemented. Search results depend on records existing in the corresponding Supabase tables and being eligible for display.
- CALERIS MASTERS does not display partnership/Official Partners content.
- Existing landing cinematic motion and background assets are retained. The legacy `cinematic-motion.js` remains active for landing dust particles.


## Admin Configuration Foundation

The Admin Control navigation includes **Configuration Center** at `/admin/configuration`. It is restricted by the existing administrator session check and backed by dedicated Supabase tables.

Available configuration categories:

- **License** — create, edit, activate/deactivate, order, and archive configuration records for license tiers and their details.
- **Economy** — store configurable economic rules and values without seeding legacy amounts.
- **Roles** — store role metadata and policy configuration records.
- **Regulations** — store configurable regulation records.

Configuration payloads are JSON objects so new properties can be added without changing the database schema. The interface validates JSON before saving. Each create, update, or delete is captured in an append-only revision table and can be reviewed from the configuration detail view.

**Important implementation boundary:** this phase delivers the configuration management foundation and persistence. It does not yet apply license evaluations, salary payments, economy transactions, role-permission changes, or competition rules to operational workflows. Those engines are implemented in later phases and must consume these records server-side. No legacy numerical values are preloaded.

### Configuration database

- `public.caleris_configurations` stores the current configuration records by category and key.
- `public.caleris_configuration_revisions` stores immutable change snapshots.
- Both tables have RLS enabled. Only authenticated users listed in `site_admins` can read or modify current configurations; revision snapshots are Admin-readable and append-only. Anonymous and PUBLIC table privileges are explicitly revoked.
- The legacy `Journalist` member role was removed from the role constraint. Existing role names retained: Driver, Principal, Owner, Agent, and FIA.
- Migrations: `20261112120938_caleris_configuration_foundation.sql` `20261112121143_caleris_configuration_fk_indexes.sql`, and `20261112121349_restrict_caleris_configuration_table_grants.sql`.
