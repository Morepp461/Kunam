# Race Engine Testing Auth & Quick Setup

## Scope
Fix the Race Engine Lab test authentication flow and reduce the default setup form to the minimum inputs required for a synthetic session.

## Authentication changes
- The browser session token must belong to Supabase Testing project `vxwvhyyvoipjwucbrvlu`.
- The Edge Function validates the user token against its own Testing project, not Production.
- Admin membership is checked against `site_admins` in the Testing database using the server-side service client.
- The Testing gateway JWT remains separate from the user session token. JWT verification stays enabled.
- The browser refreshes a near-expiry session and retries a 401 once after refreshing.
- If the configured browser Supabase URL is not the Testing project, the UI now reports the project mismatch explicitly.
- Supabase Production is not read or modified by this change.

## Quick Test form
Visible by default:
- Drivers
- Teams
- Race distance
- Deterministic seed

Car setup and supported HQ levels are moved into a collapsed Advanced Setup section. Pit Crew Training Center is omitted from the form because its race effect is not configured; the existing payload keeps its neutral level at zero.

## Verification boundaries
- Testing `site_admins` currently contains one row linked to an Auth user. The current browser identity cannot be independently inspected from server-side project tooling.
- No database schema or data migration is required.
- No Vercel environment variables are changed.
- Production Edge Functions and Production database remain untouched.
