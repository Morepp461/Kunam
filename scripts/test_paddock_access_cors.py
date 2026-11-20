from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "supabase/functions/complete-paddock-access/index.ts").read_text(encoding="utf-8")


def allowed_origins():
    match = re.search(r"const allowedOrigins = new Set\(\[(.*?)\]\);", SOURCE, re.S)
    if not match:
        raise AssertionError("Paddock Access CORS allowlist is missing")
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def is_allowed(origin):
    return origin in allowed_origins() or re.fullmatch(
        r"https://[a-z0-9-]+\.vercel\.app", origin, re.I
    ) is not None


class PaddockAccessCorsTests(unittest.TestCase):
    def test_custom_production_domains_are_allowed(self):
        self.assertTrue(is_allowed("https://calerismasters.com"))
        self.assertTrue(is_allowed("https://www.calerismasters.com"))

    def test_existing_origins_remain_allowed(self):
        self.assertTrue(is_allowed("http://localhost:5173"))
        self.assertTrue(is_allowed("https://calerismastersnewgen-mu.vercel.app"))
        self.assertTrue(is_allowed("https://preview-branch.vercel.app"))

    def test_untrusted_origins_are_rejected(self):
        self.assertFalse(is_allowed("https://calerismasters.com.attacker.example"))
        self.assertFalse(is_allowed("https://example.com"))

    def test_preflight_headers_are_explicit_and_do_not_fallback(self):
        self.assertIn('"Access-Control-Allow-Methods": "POST, OPTIONS"', SOURCE)
        self.assertIn('"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version"', SOURCE)
        self.assertIn('...(isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {})', SOURCE)
        self.assertNotIn('"Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin :', SOURCE)


if __name__ == "__main__":
    unittest.main()
