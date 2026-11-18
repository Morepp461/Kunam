-- Restore the previously approved lifetime WDC defaults so season setup
-- and final classification do not depend on a manual scoring configuration.
update public.caleris_configurations
set payload=jsonb_set(
  jsonb_set(coalesce(payload,'{}'::jsonb),'{points}',to_jsonb(25),true),
  '{requires_admin_setup}','false'::jsonb,true
),
is_active=true,
updated_at=now()
where category='license' and config_key='scoring-wdc-zwei';

update public.caleris_configurations
set payload=jsonb_set(
  jsonb_set(coalesce(payload,'{}'::jsonb),'{points}',to_jsonb(35),true),
  '{requires_admin_setup}','false'::jsonb,true
),
is_active=true,
updated_at=now()
where category='license' and config_key='scoring-wdc-premio';

do $$
begin
  if not exists(select 1 from public.caleris_configurations where category='license' and config_key='scoring-wdc-zwei' and is_active and (payload->>'points')::integer=25) then
    raise exception 'Default Zwei WDC scoring could not be activated.';
  end if;
  if not exists(select 1 from public.caleris_configurations where category='license' and config_key='scoring-wdc-premio' and is_active and (payload->>'points')::integer=35) then
    raise exception 'Default Premio WDC scoring could not be activated.';
  end if;
end $$;
