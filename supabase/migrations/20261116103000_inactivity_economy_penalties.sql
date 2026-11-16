-- Inactivity economy penalties: separate from License Score penalties.
alter table public.license_season_members
  add column if not exists economy_inactive_at timestamptz,
  add column if not exists economy_inactive_round_id uuid references public.license_rounds(id) on delete set null;

create table if not exists public.caleris_inactivity_penalty_rules (
  id boolean primary key default true check (id),
  consecutive_missed_checkins integer not null default 5 check (consecutive_missed_checkins between 1 and 100),
  driver_wallet_penalty_percent numeric(5,2) not null default 50 check (driver_wallet_penalty_percent between 0 and 100),
  team_wallet_fine numeric(20,2) not null default 2000 check (team_wallet_fine >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.caleris_inactivity_penalty_rules(id) values(true)
on conflict(id) do nothing;

alter table public.caleris_inactivity_penalty_rules enable row level security;
revoke all on public.caleris_inactivity_penalty_rules from anon, authenticated, public;
grant select, insert, update on public.caleris_inactivity_penalty_rules to authenticated;
create policy "Admins manage inactivity economy rules"
  on public.caleris_inactivity_penalty_rules for all to authenticated
  using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
  with check (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.apply_inactivity_economy_penalties()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.caleris_inactivity_penalty_rules%rowtype;
  v_member record;
  v_bank_id uuid;
  v_driver_wallet_id uuid;
  v_team_wallet_id uuid;
  v_penalty numeric(20,2);
begin
  if new.status <> 'closed' or old.status = 'closed' then return new; end if;

  select * into v_rule from public.caleris_inactivity_penalty_rules where id=true;
  if not found then raise exception 'Aturan penalti ekonomi inactivity belum tersedia.'; end if;

  select id into v_bank_id from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active
  order by created_at limit 1;
  if v_bank_id is null then raise exception 'Wallet VreeoBank aktif tidak ditemukan.'; end if;

  for v_member in
    select sm.id as registration_id, sm.member_id, sm.season_id,
           sm.consecutive_absent_rounds, m.character_name, m.team_id
    from public.license_season_members sm
    join public.members m on m.id=sm.member_id and m.role='Driver'
    where sm.season_division_id=new.season_division_id
      and not sm.is_hiatus
      and sm.consecutive_absent_rounds >= v_rule.consecutive_missed_checkins
      and sm.economy_inactive_at is null
    for update of sm
  loop
    select id,balance into v_driver_wallet_id,v_penalty
    from public.economy_wallet_accounts
    where account_kind='driver' and member_id=v_member.member_id and is_active
    for update;
    if v_driver_wallet_id is null then
      raise exception 'Driver Wallet tidak ditemukan untuk member %.',v_member.member_id;
    end if;

    v_penalty := round(greatest(v_penalty,0) * v_rule.driver_wallet_penalty_percent / 100,2);
    if v_penalty > 0 then
      perform private.post_economy_transaction(
        v_driver_wallet_id,v_bank_id,v_penalty,'fine',
        'Penalti ekonomi Driver tidak aktif setelah melewatkan '
          ||v_rule.consecutive_missed_checkins||' check-in terjadwal',
        'inactive-driver:'||new.id::text||':'||v_member.member_id::text,
        new.processed_by,
        jsonb_build_object('reason','inactive_driver','round_id',new.id,
          'season_id',v_member.season_id,'absence_streak',v_member.consecutive_absent_rounds,
          'penalty_percent',v_rule.driver_wallet_penalty_percent)
      );
    end if;

    if v_member.team_id is not null and v_rule.team_wallet_fine > 0 then
      select id into v_team_wallet_id from public.economy_wallet_accounts
      where account_kind='team' and team_id=v_member.team_id and is_active
      for update;
      if v_team_wallet_id is null then
        raise exception 'Team Wallet tidak ditemukan untuk tim %.',v_member.team_id;
      end if;
      perform private.post_economy_transaction(
        v_team_wallet_id,v_bank_id,v_rule.team_wallet_fine,'fine',
        'Denda tim karena Driver tidak aktif selama '
          ||v_rule.consecutive_missed_checkins||' check-in terjadwal',
        'inactive-team:'||new.id::text||':'||v_member.member_id::text,
        new.processed_by,
        jsonb_build_object('reason','inactive_driver_team_fine','round_id',new.id,
          'season_id',v_member.season_id,'driver_member_id',v_member.member_id,
          'absence_streak',v_member.consecutive_absent_rounds)
      );
    end if;

    update public.license_season_members
    set economy_inactive_at=now(),economy_inactive_round_id=new.id
    where id=v_member.registration_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists license_round_inactivity_economy on public.license_rounds;
create trigger license_round_inactivity_economy
after update of status on public.license_rounds
for each row execute function private.apply_inactivity_economy_penalties();

revoke all on function private.apply_inactivity_economy_penalties() from public, anon, authenticated, service_role;
