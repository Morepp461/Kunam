begin;

create or replace function private.team_division_base_valuation(p_division_key text)
returns numeric(20,2)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_key text:=lower(coalesce(p_division_key,'')); v_tier integer;
begin
  if v_key='premio' then return 120000000;
  elsif v_key='zwei' then return 100000000;
  end if;
  select 2+ranked.tier_offset into v_tier
  from (
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
  return greatest(0,140000000-(20000000*greatest(v_tier,1)));
end $$;

create or replace function private.set_team_default_base_valuation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.base_valuation:=private.team_division_base_valuation(new.division_key);
  return new;
end $$;

-- Correct existing base values to the approved tier schedule; historical valuation snapshots remain untouched.
update public.teams
set base_valuation=private.team_division_base_valuation(division_key)
where base_valuation is distinct from private.team_division_base_valuation(division_key);

create or replace function public.admin_recalculate_team_valuation(p_team_id uuid,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','private'
as $$
declare v_admin boolean; v_base numeric(20,2); v_key text;
begin
  select exists(select 1 from public.site_admins a where a.user_id=auth.uid()) into v_admin;
  if not v_admin then raise exception 'Admin access required'; end if;
  select division_key into v_key from public.teams where id=p_team_id for update;
  if not found then raise exception 'Team not found'; end if;
  v_base:=private.team_division_base_valuation(v_key);
  update public.teams set base_valuation=v_base where id=p_team_id;
  return public.admin_assess_team_valuation(p_team_id,v_base,p_notes);
end $$;
revoke all on function public.admin_recalculate_team_valuation(uuid,text) from public,anon;
grant execute on function public.admin_recalculate_team_valuation(uuid,text) to authenticated;

commit;