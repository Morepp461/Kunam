-- CALERIS Team Take Over valuation band update.
-- The agreed offer window is 40%–200% of the latest approved team valuation.
update public.caleris_configurations
set payload = jsonb_set(
  jsonb_set(coalesce(payload, '{}'::jsonb), '{minimum_percent}', '40'::jsonb, true),
  '{maximum_percent}', '200'::jsonb, true
),
updated_at = now()
where category = 'economy'
  and config_key = 'team-takeover-valuation-range';

-- Keep the configuration present and editable if it was absent in a fresh environment.
insert into public.caleris_configurations
  (category, config_key, title, payload, is_active, sort_order)
select
  'economy',
  'team-takeover-valuation-range',
  'Team Take Over valuation range',
  '{"minimum_percent":40,"maximum_percent":200}'::jsonb,
  true,
  0
where not exists (
  select 1 from public.caleris_configurations
  where category = 'economy' and config_key = 'team-takeover-valuation-range'
);
