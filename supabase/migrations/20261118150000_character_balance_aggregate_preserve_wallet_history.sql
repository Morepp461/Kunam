begin;

-- Keep the permanent account-to-character guard, but do not physically move
-- funds between role wallet rows. Existing payroll and cash-loan references
-- are tied to their original wallet IDs. Character cash is the aggregate of
-- all personal wallets linked to the same member/profile.
drop trigger if exists zz_members_character_wallet_sync on public.members;
drop trigger if exists zz_profiles_character_wallet_sync on public.profiles;

drop function if exists private.sync_member_character_wallet();
drop function if exists private.sync_profile_character_wallet();
drop function if exists private.consolidate_member_character_wallets(uuid);

commit;
