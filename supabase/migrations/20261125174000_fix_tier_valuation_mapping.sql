begin;
create or replace function private.set_team_default_base_valuation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_tier integer; v_key text:=lower(coalesce(new.division_key,''));
begin
  if new.base_valuation is null then
    if v_key='premio' then
      v_tier:=1;
    elsif v_key='zwei' then
      v_tier:=2;
    else
      select 2+ranked.tier_offset into v_tier from (
        select division_key,row_number() over(order by first_created,division_key)::integer tier_offset
        from (
          select lower(division_key) division_key,min(created_at) first_created
          from public.license_season_divisions
          where lower(division_key) not in ('premio','zwei')
          group by lower(division_key)
        ) d
      ) ranked where ranked.division_key=v_key;
      if v_tier is null then
        select 3+count(distinct lower(division_key)) into v_tier
        from public.license_season_divisions
        where lower(division_key) not in ('premio','zwei');
      end if;
    end if;
    new.base_valuation:=140000000-(20000000*v_tier);
  end if;
  return new;
end $$;
commit;
