-- Add structured circuit identity to each scheduled race round.
-- Existing rounds remain valid and can be completed by FIA/Admin over time.
alter table public.license_rounds
  add column if not exists circuit_name text,
  add column if not exists circuit_country_code text;

alter table public.license_rounds
  drop constraint if exists license_rounds_circuit_country_code_check;
alter table public.license_rounds
  add constraint license_rounds_circuit_country_code_check
  check (circuit_country_code is null or circuit_country_code ~ '^[A-Z]{2}$');

-- Existing profiles are intentionally left untouched until their owners choose
-- their real location. NOT VALID preserves old rows but enforces the rule for
-- every new or updated profile row.
alter table public.profiles
  drop constraint if exists profiles_required_nationality_hometown_check;
alter table public.profiles
  add constraint profiles_required_nationality_hometown_check
  check (
    nationality is not null and btrim(nationality) <> ''
    and hometown is not null and btrim(hometown) <> ''
  ) not valid;
