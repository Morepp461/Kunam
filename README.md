# Caleris Masters

CALERIS MASTERS is a Motorsport Roleplay web platform.

## Stack
React 19, TypeScript, Vite, React Router, Supabase Auth/Postgres (integration foundation only), and Vercel.

## Foundation delivered
- Existing landing visual identity, original background and logo assets are retained.
- Global deep-click interaction and tire-track click trail.
- Shared loading bar and charcoal liquid-glass toast notifications with gold accents.
- Discord OAuth flow through Supabase Auth (awaiting a dedicated Supabase project).
- Rules page and admin editor with draft/publish states.
- Admin-managed Discord invite URL.
- Responsive layout and reduced-motion support.

## Environment
Copy .env.example to .env.local and set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, and VITE_CLOUDFLARE_TURNSTILE_SITE_KEY. Configure Discord Client ID/Secret in Supabase Auth > Providers. Configure TURNSTILE_SECRET_KEY only in Supabase Edge Function secrets. Never expose Supabase secret/service-role keys or Discord/Turnstile secrets in browser environment variables.

## Supabase and Paddock Access
Database schema is managed by the versioned files in `supabase/migrations/`. The first trusted administrator is bootstrapped by the admin migration. Discord OAuth callback: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`. Configure Discord provider, Site URL, and redirect allow-list in Supabase Auth. New Discord sign-ins must complete Paddock Access before reaching member pages. Paddock Access validates Cloudflare Turnstile tokens server-side through the `complete-paddock-access` Edge Function. Set `TURNSTILE_SECRET_KEY` in Supabase Edge Function secrets; the public site key belongs in `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY`. Existing legacy cinematic-motion.js remains active for the landing dust particles.

## Development
npm install
npm run dev
npm run check
npm run build
