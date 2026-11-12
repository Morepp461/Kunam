-- Explicitly agreed negotiation limits and takeover valuation bounds are editable
-- through Admin Control -> Configuration Center. No economy prices or tax rates are seeded.
insert into public.caleris_configurations(category,config_key,title,payload,is_active,sort_order)
values
 ('economy','driver-move-negotiation-limits','Driver Move Negotiation Limits',
  jsonb_build_object('max_counters_per_side',3,'max_total_counters',6),true,30),
 ('economy','team-takeover-negotiation-limits','Team Takeover Negotiation Limits',
  jsonb_build_object('max_counters_per_side',3,'max_total_counters',6),true,31),
 ('economy','team-takeover-valuation-range','Team Takeover Valuation Range',
  jsonb_build_object('minimum_percent',60,'maximum_percent',160),true,32)
on conflict(category,config_key) do nothing;
