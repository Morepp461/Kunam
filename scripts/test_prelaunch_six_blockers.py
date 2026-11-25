from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
DATA_EXPORT = (ROOT / "supabase/functions/caleris-data-export/index.ts").read_text(encoding="utf-8")
INTEGRATIONS = (ROOT / "supabase/functions/caleris-integrations/index.ts").read_text(encoding="utf-8")
APP = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
SITEMAP = (ROOT / "public/sitemap.xml").read_text(encoding="utf-8")

PRODUCTION_ORIGINS = {
    "https://calerismasters.com",
    "https://www.calerismasters.com",
}


def assert_origin_allowlist(source: str, expression: str):
    for origin in PRODUCTION_ORIGINS:
        assert origin in source, f"Missing production origin: {origin}"
    assert re.search(expression, source, re.S), "Vercel preview origin handling is missing"


class PrelaunchBoundaryTests(unittest.TestCase):
    def test_data_export_allows_canonical_domains(self):
        assert_origin_allowlist(DATA_EXPORT, r"const allowedOrigin\s*=.*?\.vercel\.app")

    def test_integrations_has_explicit_browser_cors(self):
        assert_origin_allowlist(INTEGRATIONS, r"const allowedOrigin\s*=.*?\.vercel\.app")
        self.assertIn('"Access-Control-Allow-Origin": origin', INTEGRATIONS)
        self.assertIn('"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version"', INTEGRATIONS)
        self.assertIn('"Access-Control-Allow-Methods": "GET, POST, OPTIONS"', INTEGRATIONS)
        self.assertIn('headers: corsHeaders(origin)', INTEGRATIONS)

    def test_privacy_consent_matches_policy_scope(self):
        self.assertIn("telah membaca Kebijakan Privasi", APP)
        self.assertIn("operasional fitur serta keamanan akun", APP)
        self.assertNotIn("hanya digunakan untuk keamanan akun", APP)

    def test_public_legal_pages_are_in_sitemap(self):
        self.assertIn("https://calerismasters.com/privacy-policy", SITEMAP)
        self.assertIn("https://calerismasters.com/terms-and-conditions", SITEMAP)


if __name__ == "__main__":
    unittest.main()
