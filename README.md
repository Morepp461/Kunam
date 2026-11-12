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

## Current Project Notes

- The footer and both legal routes are implemented; legal page copy is intentionally pending.
- The global search UI and server-side directory endpoint are implemented. Search results depend on records existing in the corresponding Supabase tables and being eligible for display.
- CALERIS MASTERS does not display partnership/Official Partners content.
- Existing landing cinematic motion and background assets are retained. The legacy `cinematic-motion.js` remains active for landing dust particles.
