begin;

-- XP reward values are code-owned constants, never Admin configuration.
alter table public.caleris_xp_ledger
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.caleris_xp_ledger
  drop constraint if exists caleris_xp_ledger_source_type_check;
alter table public.caleris_xp_ledger
  add constraint caleris_xp_ledger_source_type_check
  check (source_type = any (array[
    'race_result','race_result_correction','checkin','quest','milestone','shop_purchase','admin_adjustment'
  ]::text[]));

create or replace function public.caleris_milestone_reward_xp(p_code text)
returns integer
language sql
immutable
set search_path=''
as $function$
  select case p_code
    when 'career_first_title' then 20
    when 'career_first_podium' then 5
    when 'career_ten_podiums' then 12
    when 'career_100_points' then 8
    when 'career_500_points' then 15
    when 'career_race_starts_1' then 5
    when 'career_race_starts_10' then 10
    when 'career_race_starts_25' then 15
    when 'career_first_win' then 10
    when 'career_five_wins' then 18
    when 'driver_xp_50' then 5
    when 'driver_xp_100' then 5
    when 'driver_xp_200' then 8
    when 'driver_xp_400' then 10
    when 'driver_xp_800' then 12
    when 'driver_xp_1600' then 15
    when 'driver_xp_3200' then 18
    when 'driver_xp_6400' then 20
    else 0
  end;
$function$;

-- Keep the display mirror aligned with the immutable source-code reward map.
update public.caleris_milestone_definitions
set xp_reward=case when scope='driver' then public.caleris_milestone_reward_xp(code) else 0 end;

-- Remove the editable/default-zero reward table from every client-facing path.
update public.caleris_xp_reward_settings set reward_xp=0,updated_by=null,updated_at=now();
revoke all on public.caleris_xp_reward_settings from public,anon,authenticated,service_role;

create or replace function public.caleris_award_configured_xp(
  p_member uuid,
  p_source text,
  p_id text,
  p_description text
) returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_reward integer:=0;
  v_difficulty text;
  v_assignment_id uuid;
  v_inserted integer;
begin
  if p_member is null or nullif(btrim(p_id),'') is null then return; end if;

  if p_source='checkin' then
    begin v_assignment_id:=p_id::uuid; exception when others then return; end;
    if not exists(
      select 1 from public.caleris_member_race_checkins c
      where c.id=v_assignment_id and c.member_id=p_member
    ) then return; end if;
    v_reward:=10;
  elsif p_source='quest' then
    begin v_assignment_id:=p_id::uuid; exception when others then return; end;
    select q.difficulty into v_difficulty
    from public.caleris_quest_assignments a
    join public.caleris_quest_catalog q on q.id=a.quest_id
    where a.id=v_assignment_id
      and a.member_id=p_member
      and a.status='completed'
      and a.reward_status='paid'
      and a.paid_at is not null;
    if not found then return; end if;
    v_reward:=case lower(v_difficulty)
      when 'easy' then 5
      when 'normal' then 10
      when 'hard' then 15
      else 0
    end;
  else
    -- Race XP is reconciled from official results; Shop XP is deliberately zero.
    return;
  end if;

  if v_reward<=0 then return; end if;
  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description,metadata)
  values(
    p_member,v_reward,p_source,p_id,left(coalesce(p_description,''),240),
    jsonb_build_object('source_type',p_source,'source_id',p_id,'reward_xp',v_reward)
  )
  on conflict(member_id,source_type,source_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=1 then
    perform public.caleris_log_activity(
      p_member,null,'xp_earned','XP diperoleh',
      '+'||v_reward||' XP · '||left(coalesce(p_description,''),160),
      jsonb_build_object('amount',v_reward,'source_type',p_source,'source_id',p_id)
    );
  end if;
end;
$function$;

-- A Quest earns XP only when the authoritative claim RPC has successfully paid it.
create or replace function public.caleris_xp_quest_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.reward_status='paid' and new.paid_at is not null
     and (old.reward_status is distinct from new.reward_status or old.paid_at is distinct from new.paid_at)
     and new.member_id is not null then
    perform public.caleris_award_configured_xp(new.member_id,'quest',new.id::text,'Quest reward claimed');
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_xp_quest_award on public.caleris_quest_assignments;
create trigger caleris_xp_quest_award
after update of reward_status,paid_at on public.caleris_quest_assignments
for each row execute function public.caleris_xp_quest_trigger();

-- The canonical check-in row exists for every eligible role. Do not award from
-- license_daily_checkins as that is only the Driver license-scoring mirror.
drop trigger if exists caleris_xp_checkin_award on public.license_daily_checkins;
drop trigger if exists caleris_xp_member_checkin_award on public.caleris_member_race_checkins;
create or replace function public.caleris_xp_checkin_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform public.caleris_award_configured_xp(new.member_id,'checkin',new.id::text,'Race check-in');
  return new;
end;
$function$;
create trigger caleris_xp_member_checkin_award
after insert on public.caleris_member_race_checkins
for each row execute function public.caleris_xp_checkin_trigger();

-- Development Shop is not an XP source. Ordinary Shop has no eligible items yet.
drop trigger if exists caleris_xp_shop_award on public.caleris_development_shop_purchases;

-- Race XP is reconciled to the latest official published classification. State
-- rows make every correction/republication idempotent and preserve full history.
create table if not exists private.caleris_xp_race_award_state (
  round_id uuid not null references public.license_rounds(id) on delete restrict,
  entry_id uuid not null,
  member_id uuid not null references public.members(id) on delete restrict,
  credited_xp integer not null default 0 check (credited_xp>=0),
  revision integer not null default 0 check (revision>=0),
  last_result_id uuid,
  updated_at timestamptz not null default now(),
  primary key(round_id,entry_id,member_id)
);
create index if not exists caleris_xp_race_award_member_idx
  on private.caleris_xp_race_award_state(member_id,round_id);

create or replace function private.caleris_apply_race_xp_delta(
  p_round_id uuid,
  p_entry_id uuid,
  p_member_id uuid,
  p_result_id uuid,
  p_desired_xp integer,
  p_position integer,
  p_is_pole boolean,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_state private.caleris_xp_race_award_state%rowtype;
  v_delta integer;
  v_revision integer;
  v_source_type text;
  v_source_id text;
begin
  if p_round_id is null or p_entry_id is null or p_member_id is null
     or p_desired_xp<0 or p_desired_xp>25 then
    raise exception 'Invalid race XP reconciliation input.';
  end if;

  insert into private.caleris_xp_race_award_state(round_id,entry_id,member_id,credited_xp)
  values(p_round_id,p_entry_id,p_member_id,0)
  on conflict(round_id,entry_id,member_id) do nothing;

  select * into v_state
  from private.caleris_xp_race_award_state
  where round_id=p_round_id and entry_id=p_entry_id and member_id=p_member_id
  for update;

  v_delta:=p_desired_xp-v_state.credited_xp;
  if v_delta=0 then
    update private.caleris_xp_race_award_state
    set last_result_id=p_result_id,updated_at=now()
    where round_id=p_round_id and entry_id=p_entry_id and member_id=p_member_id;
    return;
  end if;

  v_revision:=v_state.revision+1;
  v_source_type:=case when v_delta>0 then 'race_result' else 'race_result_correction' end;
  v_source_id:='race-result:'||p_round_id::text||':'||p_entry_id::text||':'||p_member_id::text||':revision:'||v_revision::text;

  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description,metadata)
  values(
    p_member_id,v_delta,v_source_type,v_source_id,
    case when v_delta>0 then 'Official race result XP' else 'Official race result XP correction' end,
    jsonb_build_object(
      'round_id',p_round_id,'entry_id',p_entry_id,'result_id',p_result_id,
      'revision',v_revision,'previous_xp',v_state.credited_xp,'current_xp',p_desired_xp,
      'delta',v_delta,'finishing_position',p_position,'pole_position',p_is_pole,
      'reason',left(coalesce(p_reason,'official_result_reconciliation'),120)
    )
  );

  update private.caleris_xp_race_award_state
  set credited_xp=p_desired_xp,revision=v_revision,last_result_id=p_result_id,updated_at=now()
  where round_id=p_round_id and entry_id=p_entry_id and member_id=p_member_id;

  perform public.caleris_log_activity(
    p_member_id,null,
    case when v_delta>0 then 'xp_earned' else 'xp_adjustment' end,
    case when v_delta>0 then 'XP diperoleh' else 'Koreksi XP hasil race' end,
    case when v_delta>0 then '+' else '' end||v_delta||' XP · Official race result',
    jsonb_build_object('round_id',p_round_id,'entry_id',p_entry_id,'result_id',p_result_id,'delta',v_delta,'reason',p_reason)
  );
end;
$function$;

create or replace function private.caleris_reconcile_race_xp(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result_id uuid;
  v_pole_member_id uuid;
  v_is_official boolean:=false;
  v_entry record;
  v_desired integer;
  v_is_pole boolean;
  v_state record;
begin
  if p_round_id is null then return; end if;

  select rr.id,rr.pole_member_id,
    (rr.published_at is not null and lower(coalesce(r.race_lifecycle_status,r.status,'')) in ('completed','closed'))
  into v_result_id,v_pole_member_id,v_is_official
  from public.license_rounds r
  left join public.caleris_race_results rr on rr.round_id=r.id
  where r.id=p_round_id;

  if not found then return; end if;

  for v_entry in
    select e.id,e.member_id,e.finish_status,e.finishing_position
    from public.caleris_race_result_entries e
    where e.round_id=p_round_id and e.member_id is not null
    order by e.id
  loop
    v_is_pole:=v_is_official and v_pole_member_id=v_entry.member_id;
    v_desired:=case
      when not v_is_official or v_entry.finish_status is distinct from 'finished' then 0
      when v_entry.finishing_position=1 then 20
      when v_entry.finishing_position=2 then 15
      when v_entry.finishing_position=3 then 12
      else 0
    end + case when v_is_pole then 5 else 0 end;

    perform private.caleris_apply_race_xp_delta(
      p_round_id,v_entry.id,v_entry.member_id,v_result_id,v_desired,
      v_entry.finishing_position,v_is_pole,
      case when v_is_official then 'official_result_published_or_corrected' else 'official_result_unpublished_or_voided' end
    );
  end loop;

  -- Reconcile removed/reassigned entries without deleting their audit state.
  for v_state in
    select s.entry_id,s.member_id
    from private.caleris_xp_race_award_state s
    where s.round_id=p_round_id
      and s.credited_xp>0
      and not exists(
        select 1 from public.caleris_race_result_entries e
        where e.id=s.entry_id and e.member_id=s.member_id and e.round_id=p_round_id
      )
    order by s.entry_id,s.member_id
  loop
    perform private.caleris_apply_race_xp_delta(
      p_round_id,v_state.entry_id,v_state.member_id,v_result_id,0,null,false,
      'official_result_entry_removed_or_member_reassigned'
    );
  end loop;
end;
$function$;

create or replace function public.caleris_xp_race_reconcile_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    if tg_table_name='caleris_race_results' then
      perform private.caleris_reconcile_race_xp(old.round_id);
    elsif tg_table_name='caleris_race_result_entries' then
      perform private.caleris_reconcile_race_xp(old.round_id);
    else
      perform private.caleris_reconcile_race_xp(old.id);
    end if;
    return old;
  end if;

  if tg_table_name='caleris_race_results' or tg_table_name='caleris_race_result_entries' then
    perform private.caleris_reconcile_race_xp(new.round_id);
    if tg_op='UPDATE' and old.round_id is distinct from new.round_id then
      perform private.caleris_reconcile_race_xp(old.round_id);
    end if;
  else
    perform private.caleris_reconcile_race_xp(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function private.caleris_apply_race_xp_delta(uuid,uuid,uuid,uuid,integer,integer,boolean,text) from public,anon,authenticated,service_role;
revoke all on function private.caleris_reconcile_race_xp(uuid) from public,anon,authenticated,service_role;
revoke all on function public.caleris_xp_race_reconcile_trigger() from public,anon,authenticated,service_role;

drop trigger if exists caleris_xp_race_entry_award on public.caleris_race_result_entries;
drop trigger if exists caleris_xp_race_entry_reversal on public.caleris_race_result_entries;
drop trigger if exists caleris_xp_race_results_reconcile on public.caleris_race_results;
drop trigger if exists caleris_xp_race_entries_reconcile on public.caleris_race_result_entries;
drop trigger if exists caleris_xp_race_round_reconcile on public.license_rounds;

create constraint trigger caleris_xp_race_results_reconcile
after insert or update or delete on public.caleris_race_results
deferrable initially deferred for each row
execute function public.caleris_xp_race_reconcile_trigger();

create constraint trigger caleris_xp_race_entries_reconcile
after insert or update or delete on public.caleris_race_result_entries
deferrable initially deferred for each row
execute function public.caleris_xp_race_reconcile_trigger();

create constraint trigger caleris_xp_race_round_reconcile
after update of status,race_lifecycle_status on public.license_rounds
deferrable initially deferred for each row
execute function public.caleris_xp_race_reconcile_trigger();

-- Preserve Community Progression feed and milestone refresh, but do not use
-- the old random-ID race reversal path. The deferred reconciliation above is
-- the only automatic race XP correction path.
create or replace function public.caleris_round_community_progression_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  old_official boolean;
  new_official boolean;
  entry record;
begin
  old_official:=lower(coalesce(old.race_lifecycle_status,old.status,'')) in('completed','closed');
  new_official:=lower(coalesce(new.race_lifecycle_status,new.status,'')) in('completed','closed');

  for entry in
    select id,member_id,team_id,driver_name_snapshot,finishing_position
    from public.caleris_race_result_entries
    where round_id=new.id
  loop
    if old_official and not new_official then
      perform public.caleris_log_activity(
        entry.member_id,entry.team_id,'race_result_voided','Hasil balapan dibatalkan',
        coalesce(entry.driver_name_snapshot,'Driver')||' tidak lagi dihitung dalam hasil resmi.',
        jsonb_build_object('source_id','round-void:'||new.id::text||':'||entry.id::text,'round_id',new.id)
      );
    elsif not old_official and new_official then
      perform public.caleris_log_activity(
        entry.member_id,entry.team_id,'race_result','Hasil balapan tercatat',
        coalesce(entry.driver_name_snapshot,'Driver')||' menyelesaikan ronde dengan posisi '||coalesce(entry.finishing_position::text,'-'),
        jsonb_build_object('source_id',entry.id::text,'round_id',new.id,'position',entry.finishing_position)
      );
    end if;
    perform public.caleris_refresh_team_milestones(entry.team_id);
    perform public.caleris_refresh_driver_milestones(entry.member_id);
  end loop;
  return new;
end;
$function$;

-- XP milestone rewards are deterministic per member+milestone, and permanent.
do $milestone_patch$
declare
  v_source text;
  v_before text;
begin
  select pg_get_functiondef('public.caleris_refresh_driver_milestones(uuid)'::regprocedure)
  into v_source;

  v_before:=v_source;
  v_source:=replace(v_source,'if coalesce(d.xp_reward,0)>0 then','if public.caleris_milestone_reward_xp(d.code)>0 then');
  v_source:=replace(v_source,'values(p_member,d.xp_reward,','values(p_member,public.caleris_milestone_reward_xp(d.code),');
  v_source:=replace(v_source,'total_xp:=total_xp+d.xp_reward;','total_xp:=total_xp+public.caleris_milestone_reward_xp(d.code);');
  v_source:=regexp_replace(v_source,'completion_source:=d.code\\|\\|[^;]*;','completion_source:=d.code;','g');
  v_source:=regexp_replace(
    v_source,
    'if net_awarded>0 then[[:space:]]*insert[^;]*on conflict[^;]*;[[:space:]]*total_xp:=total_xp-net_awarded;[[:space:]]*end if;',
    '-- Achievement XP is permanent; only official race-result corrections may reverse XP.',
    'g'
  );
  if v_source=v_before
     or position('d.xp_reward' in v_source)>0
     or position('values(p_member,-net_awarded' in v_source)>0
     or position('total_xp:=total_xp-net_awarded' in v_source)>0
     or position('completion_source:=d.code||' in v_source)>0 then
    raise exception 'Community milestone XP source changed; refusing unsafe patch.';
  end if;
  execute v_source;
end;
$milestone_patch$;

-- Do not expose generic reward-setting mutation or generic award RPCs to clients.
revoke all on function public.caleris_award_configured_xp(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.caleris_award_xp(uuid,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.caleris_milestone_reward_xp(text) from public,anon,authenticated,service_role;
grant execute on function public.caleris_milestone_reward_xp(text) to service_role;

commit;
