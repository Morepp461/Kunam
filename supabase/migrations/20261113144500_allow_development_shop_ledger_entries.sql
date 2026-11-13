alter table public.caleris_development_ledger drop constraint if exists caleris_development_ledger_source_type_check;
alter table public.caleris_development_ledger add constraint caleris_development_ledger_source_type_check
 check(source_type = any(array['race_win','pole_position','quest_reward','admin_adjustment','reversal','shop_purchase']::text[]));