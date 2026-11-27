from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

assets_sql = read("supabase/migrations/20261127140000_assets_marketplace_core.sql")
achievement_sql = read("supabase/migrations/20261127141000_achievement_expansion_digital_id_templates.sql")
midtrans_sql = read("supabase/migrations/20261127142000_midtrans_hq_shop_foundation.sql")
assets_page = read("src/AssetsMarketplace.tsx")
shop_page = read("src/ShopPage.tsx")
app = read("src/App.tsx")
layout = read("src/MainLayout.tsx")
community = read("src/CommunityProgression.tsx")
public_id = read("src/PublicMemberId.tsx")
digital_css = read("src/community-progression.css")
midtrans_fn = read("supabase/functions/midtrans-hq-shop/index.ts")

# Assets: exactly eight catalogs, five tiers each, with the owner-approved Cars names/prices.
catalog_rows = re.findall(
    r"\('([a-z_]+_tier_([1-5]))','([a-z_]+)',([1-5]),'([^']+)','([^']+)',([0-9]+),([0-9]+)\)",
    assets_sql,
)
assert len(catalog_rows) == 40, f"Expected 40 catalog rows, got {len(catalog_rows)}"
by_category = {}
for code, tier, category, tier_number, brand, asset_class, price, market_value in catalog_rows:
    by_category.setdefault(category, []).append(int(tier_number))
assert len(by_category) == 8
assert all(sorted(tiers) == [1, 2, 3, 4, 5] for tiers in by_category.values())
for fragment in [
    "'cars_tier_1','cars',1,'Avanzo','Compact',250000,250000",
    "'cars_tier_2','cars',2,'Hyande','Executive',750000,750000",
    "'cars_tier_3','cars',3,'GTW','Sports',2000000,2000000",
    "'cars_tier_4','cars',4,'Lambegini','Supercar',6000000,6000000",
    "'cars_tier_5','cars',5,'Farrara','Hypercar',15000000,15000000",
]:
    assert fragment in assets_sql, f"Missing approved Cars catalog row: {fragment}"

assert "private.caleris_assets_reputation_bonus" in assets_sql
assert "ln(1+(private.caleris_assets_market_value(p_member_id)/10000000))/ln(2)" in assets_sql
assert "least(10" in assets_sql.lower()
assert "'asset_reputation_bonus'" in assets_sql
assert "tax_eur',0" in assets_sql and "individual_asset_tax" not in assets_sql.lower()
assert "caleris_assets_buy_listing" in assets_sql and "sale_transfer" in assets_sql
assert "private.post_economy_transaction" in assets_sql
assert 'path="/assets"' in app
assert 'to:"/assets"' in layout
assert 'caleris_assets_buy' in assets_page and 'caleris_assets_buy_listing' in assets_page
assert 'caleris_assets_list' in assets_page and 'caleris_assets_cancel_listing' in assets_page
assert "member_purchase_team_hq_project_slot" not in shop_page
assert "caleris_assets_catalog" not in shop_page

# Achievement engine: source-owned rewards stay inside the existing 5–20 XP range.
assert "'achievement'" in achievement_sql
assert "array['race_result','race_result_correction','checkin','quest','milestone','shop_purchase','admin_adjustment','achievement']" in achievement_sql
assert "when 'driver_season_champion' then 20" in achievement_sql
assert "when 'team_champion' then 20" in achievement_sql
assert "between 5 and 20" in achievement_sql
for role in ["role_driver", "role_team_owner", "role_principal", "role_agent"]:
    assert role in achievement_sql
assert "role_fia" not in achievement_sql.lower()
assert "role_admin" not in achievement_sql.lower()
for source in ["caleris_community_votes", "caleris_member_race_checkins", "caleris_quest_assignments", "caleris_race_result_entries"]:
    assert source in achievement_sql

# Digital ID: exactly 14 code-owned templates, 14 distinct CSS compositions.
template_rows = re.findall(r"\('(license|reputation|division)_[a-z0-9_]+','(?:license|reputation|division)'", achievement_sql)
assert len(template_rows) == 14, f"Expected 14 Digital ID templates, got {len(template_rows)}"
template_keys = re.findall(r"\('((?:license|reputation|division)_[a-z0-9_]+)','(?:license|reputation|division)'", achievement_sql)
assert len(set(template_keys)) == 14
for key in template_keys:
    assert f".cp-id-template--{key}" in digital_css, f"Missing visual template for {key}"
assert "caleris_save_digital_id_v2" in community
assert "p_badge_codes: selectedBadges" in community
assert "selected_badges.length > 3" in community
assert "Add%20a%20heading_20260907_003952_0000.png" in community
assert "profile-avatars" in public_id
assert "Add%20a%20heading_20260907_003952_0000.png" in public_id
assert "public_visible" in achievement_sql

# Paid Shop: fixed IDR price, inactive by default, no legacy EUR wallet purchase.
assert "price_idr=29900" in midtrans_sql
assert "is_active=false" in midtrans_sql
assert "revoke all on function public.member_purchase_team_hq_project_slot(text)" in midtrans_sql
assert "grant execute on function public.caleris_midtrans_finalize_order" in midtrans_sql
assert "MIDTRANS_SIGNATURE_KEY" in midtrans_fn
assert "signature_key" in midtrans_fn
assert "/status" in midtrans_fn
assert "caleris_midtrans_finalize_order" in midtrans_fn
assert "window.location.assign(data.redirect_url)" in shop_page
assert "notifikasi pembayaran" in shop_page.lower()
assert "member_purchase_team_hq_project_slot" not in shop_page

print("Assets Marketplace, achievement, Digital ID, and Midtrans Shop static checks passed.")
