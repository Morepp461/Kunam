begin;
alter table public.caleris_digital_id_cards alter column public_visible set default false;
comment on column public.caleris_digital_id_cards.public_visible is 'Explicit opt-in for public Digital ID verification. New cards default to private.';
commit;
