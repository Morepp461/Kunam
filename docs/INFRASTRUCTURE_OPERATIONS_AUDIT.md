# Infrastructure Operations Audit

Audit date: 2026-11-17

## Environment routing

The Vercel project `caler is_masters_newgen` (project ID `prj_DiXd5IGTwypIVHK3zOVaxbAnvfEi`) must use separate Supabase targets:

| Vercel target | Supabase project | Project ref |
| --- | --- | --- |
| Production | `caleris-masters-newgen` | `asltczqrmoxnayusvjta` |
| Preview / Development | `caleris-masters-testing` | `vxwvhyyvoipjwucbrvlu` |

Both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` must be scoped to the same target. Never point Production to the testing project. Publishable keys are project-specific; do not reuse one project's key with another project's URL.

The Vercel environment variables were corrected on 2026-11-17:
- Production URL and publishable key target only `production`.
- Testing URL and publishable key target only `preview` and `development`.

A new Production deployment must be created after environment changes because Vite embeds `VITE_*` values at build time.

## Database parity snapshot

Both Supabase projects were active and reported:
- 119 migration history rows each.
- 95 public relations in the information-schema comparison.
- 896 public columns.
- 88 public base tables and 79 public routines.
- Three active pg_cron jobs: driver transfer window (every minute), pending economy retry (every five minutes), and economy settlement automation (every five minutes).

The two database migration histories contain different historical version timestamps and filenames despite equal row counts and the same latest migration (`20261116232000_cash_based_development_economy`). Do not edit `supabase_migrations.schema_migrations` directly or mark migrations repaired until each unmatched production/testing migration has been mapped to the canonical SQL file and its effects verified. The Supabase connector used for this audit exposes migration listing and application, but not the Supabase CLI migration-repair operation.

The 95-relation column comparison found no missing columns and no type/nullability/default differences. The only detected metadata differences were physical column ordinal positions in `caleris_race_result_entries` and `license_rounds`; PostgreSQL queries must use column names, not ordinal assumptions.

No database DDL was needed for the Vercel environment correction, so no migration was applied to either database for that change.

## Security advisory follow-up

The Supabase security advisor reported five views and 45 SECURITY DEFINER routines in the authenticated execution warning category in each project, plus two RLS-enabled tables without policies and Auth leaked-password protection disabled.

These findings require object-by-object review. Do not blanket-revoke authenticated EXECUTE from all SECURITY DEFINER routines: validated RPCs and trigger/helper functions may be part of required workflows. Likewise, do not change views to SECURITY INVOKER until underlying-table grants and RLS behavior are regression-tested against public directory, marketplace, circuit-pool, and takeover workflows.

## Deployment and CI

The latest production deployment before the environment correction was built from `main` commit `7977f05871b7255ad495541ef0c5fc9b8cf6adc3` and was READY. A new deployment is required to embed the corrected production Supabase target.
