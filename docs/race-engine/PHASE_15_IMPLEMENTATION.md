# Race Engine Phase 15 — Cross-project gateway authentication

## Delivered

- LIVE RACE now authenticates the Testing Edge gateway with the Testing project's publishable JWT in both `apikey` and `Authorization`.
- The production Admin session token is sent separately in `x-caleris-production-authorization`.
- The Testing Edge Function validates that production token against the Production Supabase Auth endpoint and checks `site_admins` before allowing Admin actions.
- CORS explicitly allows the custom production-authorization header.
- Worker Cron continues using the Testing gateway JWT plus the separate Vault-backed worker token; it does not use a production user token.
- Added unit coverage proving the two credentials cannot be accidentally swapped or omitted.

## Security boundary

- The Testing gateway JWT is publishable and grants no Admin capability by itself.
- The production access token is validated server-side and is not written to logs or persisted.
- `verify_jwt` remains enabled on the Testing Edge Function.
- No Vercel environment changes or Production Supabase schema/function changes.
