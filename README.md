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
Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY after the dedicated Caleris Supabase project is created. Discord Client ID/Secret belong in Supabase Dashboard provider settings, never browser environment variables. Never expose service-role keys.

## Supabase setup (later)
Review supabase/SETUP.sql and execute it only in the dedicated Caleris project The SQL creates a dedicated site_admins allow-list; seed the first trusted admin UUID manually after their first Discord sign-in. Configure Discord provider, callback https://<PROJECT_REF>.supabase.co/auth/v1/callback, Site URL, and redirect allow-list. No Supabase project or database was created or modified by this branch. Existing legacy cinematic-motion.js remains active for the landing dust particles.

## Development
npm install
npm run dev
npm run check
npm run build
