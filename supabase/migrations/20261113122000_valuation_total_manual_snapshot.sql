-- Switch total_valuation from the legacy component sum to a stored final valuation.
-- Existing historical values remain intact when the generated expression is dropped.
alter table public.caleris_team_valuations
  alter column total_valuation drop expression;
