# CALERIS integrations

This repository keeps third-party credentials out of source control and browser bundles.

## Discord notifications

Edge Function: `caleris-discord-notify` (slug: `caleris-discord-notify`)

Required Supabase Function secret:
- `DISCORD_WEBHOOK_URL`: Discord channel webhook URL.

The function requires a valid Supabase user session and checks FIA/Admin permissions server-side. It only accepts HTTPS links to the official Caleris production domain, disables Discord mention parsing, and never returns the webhook secret. Add the secret separately to both Supabase projects when ready.

Request body:
```json
{
  "event": "fia_announcement",
  "title": "Announcement title",
  "description": "Announcement text",
  "url": "https://calerismastersnewgen-mu.vercel.app/"
}
```

Call through `supabase.functions.invoke("caleris-discord-notify", { body })`.

## Google Analytics 4

Optional Vercel environment variable:
- `VITE_GA_MEASUREMENT_ID`: GA4 measurement ID (format `G-XXXXXXXXXX`).

Page tracking is disabled by default. A user must explicitly allow analytics in Account Settings before the tracker loads. If the variable is missing or consent is denied, no Google Analytics script is loaded.

The GA4 Data API reporting service is intentionally not enabled in the browser. It requires server-side Google credentials and a GA4 property ID; add those only when the reporting endpoint is implemented. Never put a service-account JSON key or private Google API credential in a `VITE_*` variable.

## Credential handling

- Do not commit keys, webhook URLs, service-account JSON, or OAuth client secrets.
- Keep browser-safe public configuration separate from server-side secrets.
- Configure Testing first, verify, then Production.
