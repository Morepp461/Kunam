from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
helper = ROOT / "src" / "lib" / "imageOptimization.ts"
form = ROOT / "src" / "MainEventRegistration.tsx"
migration = ROOT / "supabase" / "migrations" / "20261116210000_registration_webp_storage_policy.sql"
assert helper.is_file(), "Missing browser-side image optimization helper"
assert migration.is_file(), "Missing WebP-only Storage migration"

source = helper.read_text(encoding="utf-8")
for fragment in [
    '"image/png", "image/jpeg", "image/webp"',
    'canvas.toBlob',
    '"image/webp"',
    'getContext("2d", { alpha: true })',
    'imageSmoothingQuality = "high"',
    'MAX_SOURCE_BYTES = 15 * 1024 * 1024',
    'MAX_SOURCE_PIXELS = 40_000_000',
    'targetBytes: 420 * 1024',
    'targetBytes: 260 * 1024',
    'hardLimitBytes: 900 * 1024',
    'hardLimitBytes: 650 * 1024',
    'decoded.dispose()',
]:
    assert fragment in source, f"Image optimizer is missing: {fragment}"

component = form.read_text(encoding="utf-8")
for fragment in [
    'optimizeImageToWebp(file,kind)',
    'file.type!=="image/webp"',
    'contentType:"image/webp"',
    'accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp"',
    'formatImageBytes(stats.originalSize)',
]:
    assert fragment in component, f"Registration upload is not WebP-safe: {fragment}"

sql = migration.read_text(encoding="utf-8").lower()
assert "allowed_mime_types=array['image/webp']" in sql
assert "file_size_limit=1048576" in sql
assert "file_size_limit=786432" in sql
assert "where id='profile-avatars'" in sql and "where id='team-logos'" in sql

print("Registration WebP optimization regression checks passed.")