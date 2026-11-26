-- Enforce the approved relative tier rule without a fixed nominal ceiling.
-- A driver may exceed values in the immediately higher tier, but cannot exceed the
-- lowest current MV in the tier two positions above.

begin;

alter function private.recalculate_driver_market_values(uuid,text)
  rename to recalculate_driver_market_values_raw;

create or replace function private.apply_driver_market_tier_relation()
returns integer
language plpgsql security definer set search_path=''
as $$
declare
  v record;
  v_cap numeric(20,2);
  v_new numeric(20,2);
  v_target numeric(20,2);
  v_count integer:=0;
begin
  for v in
    select mv.member_id,mv.market_value_eur,mv.target_value_eur,mv.mv_score,mv.tier_number
    from public.caleris_driver_market_values mv
    where mv.tier_number>=3
      and exists(select 1 from public.caleris_driver_market_values up
        where up.tier_number=mv.tier_number-2)
  loop
    select min(up.market_value_eur) into v_cap
    from public.caleris_driver_market_values up
    where up.tier_number=v.tier_number-2;
    if v_cap is null then continue; end if;
    v_new:=least(v.market_value_eur,v_cap);
    v_target:=least(v.target_value_eur,v_cap);
    if v_new is distinct from v.market_value_eur then
      update public.caleris_driver_market_values
        set market_value_eur=v_new,target_value_eur=v_target,updated_at=now()
        where member_id=v.member_id;
      insert into public.caleris_driver_market_value_history(
        member_id,season_id,previous_value_eur,new_value_eur,mv_score,tier_number,breakdown,reason
      )
      select v.member_id,s.id,v.market_value_eur,v_new,v.mv_score,v.tier_number,
        jsonb_build_object('tier_relation_cap',true,'cap_tier',v.tier_number-2,'cap_value_eur',v_cap),
        'tier_relation_cap'
      from (select id from public.license_seasons where status='active'
        order by starts_on desc,created_at desc limit 1) s;
    elsif v_target is distinct from v.target_value_eur then
      update public.caleris_driver_market_values
        set target_value_eur=v_target,updated_at=now()
        where member_id=v.member_id;
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.recalculate_driver_market_values(
  p_member_id uuid default null,
  p_reason text default 'recalculation'
) returns integer
language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  v_count:=private.recalculate_driver_market_values_raw(p_member_id,p_reason);
  perform private.apply_driver_market_tier_relation();
  return v_count;
end;
$$;

revoke all on function private.recalculate_driver_market_values_raw(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.apply_driver_market_tier_relation() from public,anon,authenticated,service_role;
revoke all on function private.recalculate_driver_market_values(uuid,text) from public,anon,authenticated,service_role;

commit;
