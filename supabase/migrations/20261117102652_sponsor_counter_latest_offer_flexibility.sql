create or replace function private.sponsor_engine_respond(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_offer public.caleris_sponsorship_offers%rowtype;
  v_sponsor public.caleris_sponsors%rowtype;
  v_last public.caleris_sponsorship_offer_revisions%rowtype;
  v_initial numeric;v_limit numeric;v_amount numeric;v_response text;
begin
  select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
  if not found or v_offer.target_kind<>'team' or v_offer.status<>'negotiating' then
    return jsonb_build_object('status','not_waiting');
  end if;
  if v_offer.expires_at is not null and now()>v_offer.expires_at then
    update public.caleris_sponsorship_offers set status='expired' where id=v_offer.id;
    return jsonb_build_object('status','expired');
  end if;
  select * into v_sponsor from public.caleris_sponsors where id=v_offer.sponsor_id for update;
  select * into v_last from public.caleris_sponsorship_offer_revisions
  where offer_id=v_offer.id order by created_at desc,id desc limit 1;
  if not found or v_last.actor_kind<>'member' then return jsonb_build_object('status','not_waiting'); end if;
  -- Flexibility is measured from the sponsor's latest actual offer, not the
  -- original opening offer. This allows small incremental negotiations while
  -- still rejecting unreasonable jumps immediately.
  select amount into v_initial from public.caleris_sponsorship_offer_revisions
  where offer_id=v_offer.id and actor_kind='admin'
  order by created_at desc,id desc limit 1;
  if not found then return jsonb_build_object('status','not_waiting'); end if;
  v_limit:=v_initial*(1+coalesce(v_sponsor.flexibility_percent,0)/100);

  -- A counter above the sponsor's maximum flexibility is an immediate rejection.
  -- Do not create a sponsor counter-offer that attempts to negotiate it down.
  if v_last.amount>v_limit
    or (v_sponsor.available_budget is not null and v_sponsor.available_budget<v_last.amount) then
    update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
    update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
    return jsonb_build_object('status','rejected','reason',case when v_last.amount>v_limit then 'flexibility_limit' else 'insufficient_budget' end,'counter_count',v_offer.counter_count);
  end if;

  v_amount:=v_last.amount;
  v_response:='accepted';
  update public.caleris_sponsorship_offer_revisions set response=v_response where id=v_last.id;
  insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms,response,created_at)
  values(v_offer.id,'admin',v_amount,
    coalesce(v_last.terms,'{}'::jsonb)||jsonb_build_object(
      'duration_seasons',coalesce(nullif(v_last.terms->>'duration_seasons','')::integer,
        nullif(v_offer.terms->>'duration_seasons','')::integer,v_sponsor.default_duration_seasons,1),
      'engine_response',v_response
    ),v_response,clock_timestamp());
  update public.caleris_sponsorship_offers set status='offered',proposed_amount=v_amount where id=v_offer.id;
  return jsonb_build_object('status',v_response,'amount',v_amount,'counter_count',v_offer.counter_count);
end;
$$;
revoke all on function private.sponsor_engine_respond(uuid) from public,anon,authenticated;

create or replace function public.owner_respond_sponsorship_offer(
  p_offer_id uuid,p_action text,p_amount numeric default null,p_terms jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_member public.members%rowtype;
  v_offer public.caleris_sponsorship_offers%rowtype;
  v_last public.caleris_sponsorship_offer_revisions%rowtype;
  v_count integer;v_contract uuid;v_duration integer;v_season record;v_index integer:=0;v_bonus numeric;
  v_sponsor public.caleris_sponsors%rowtype;v_focus text;v_metric text;v_target_value numeric;v_targets jsonb;v_tier text;
  v_engine_response jsonb;
begin
  select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
  if not found or v_member.role<>'Owner' then raise exception 'Hanya Team Owner yang dapat bernegosiasi.'; end if;
  select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
  if not found or v_offer.target_kind<>'team' or v_offer.target_team_id is distinct from v_member.team_id
    or v_offer.status not in ('offered','negotiating') then raise exception 'Offer tidak tersedia untuk tim ini.'; end if;
  if v_offer.expires_at is not null and now()>v_offer.expires_at then
    update public.caleris_sponsorship_offers set status='expired' where id=v_offer.id;
    return jsonb_build_object('status','expired');
  end if;
  select count(*) into v_count from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id and actor_kind='member';

  if p_action='counter' then
    if v_count>=3 then raise exception 'Batas tiga counter-offer telah tercapai.'; end if;
    if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal counter tidak valid.'; end if;
    select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
    if v_last.actor_kind<>'admin' then raise exception 'Menunggu respons sponsor.'; end if;
    update public.caleris_sponsorship_offer_revisions set response='countered' where id=v_last.id;
    insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,actor_member_id,amount,terms)
    values(v_offer.id,'member',v_member.id,p_amount,coalesce(v_offer.terms,'{}'::jsonb)||coalesce(p_terms,'{}'::jsonb));
    update public.caleris_sponsorship_offers set status='negotiating',counter_count=v_count+1 where id=v_offer.id;

    -- Respond in the same transaction: Owner never has to trigger the sponsor engine manually.
    v_engine_response:=private.sponsor_engine_respond(v_offer.id);
    return jsonb_build_object(
      'status',coalesce(v_engine_response->>'status','negotiating'),
      'counter_count',v_count+1,
      'sponsor_response',v_engine_response
    );

  elsif p_action='accept' then
    select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
    if v_last.actor_kind<>'admin' then raise exception 'Sponsor belum memberikan penawaran final.'; end if;
    v_contract:=private.create_sponsorship_contract_from_offer(v_offer.id);
    select * into v_sponsor from public.caleris_sponsors where id=v_offer.sponsor_id;
    v_duration:=greatest(1,least(5,coalesce(nullif(v_last.terms->>'duration_seasons','')::integer,v_sponsor.default_duration_seasons,1)));
    v_bonus:=round(v_last.amount*coalesce((select (config_value->>'value')::numeric from public.caleris_brand_ecosystem_config where config_key='bonus_pool_percent'),50)/100,2);
    update public.caleris_sponsorship_contracts set duration_seasons=v_duration,annual_contract_amount=v_last.amount,
      bonus_pool_total=v_bonus*v_duration,bonus_pool_paid=0 where id=v_contract;
    v_tier:=coalesce(v_sponsor.tier_key,'T5');v_focus:=coalesce(v_sponsor.focus_key,'Finish');
    v_metric:=case v_focus when 'Poin' then 'points_round_rate' when 'Podium' then 'podium_round_rate'
      when 'Menang' then 'win_round_rate' when 'Finish' then 'finish_rate' else 'driver_popularity' end;
    select config_value into v_targets from public.caleris_brand_ecosystem_config where config_key='sponsor_focus_targets';
    v_target_value:=coalesce((v_targets->v_tier->>case v_metric when 'points_round_rate' then 'points' when 'podium_round_rate' then 'podium' when 'win_round_rate' then 'win' when 'finish_rate' then 'finish' else 'popularity' end)::numeric,0);
    for v_season in select id,starts_on,ends_on from public.license_seasons
      where starts_on >= (select starts_on from public.license_seasons where id=v_offer.season_id)
      order by starts_on asc limit v_duration
    loop
      v_index:=v_index+1;
      insert into public.caleris_sponsorship_payment_schedule(contract_id,season_id,amount,due_at)
      values(v_contract,v_season.id,v_last.amount,case when v_index=1 then now() else (v_season.starts_on::timestamp at time zone 'UTC') end)
      on conflict(contract_id,season_id) do nothing;
      insert into public.caleris_sponsorship_season_bonus_pools(contract_id,season_id,pool_total)
      values(v_contract,v_season.id,v_bonus) on conflict(contract_id,season_id) do nothing;
      insert into public.caleris_sponsorship_targets(contract_id,season_id,title,description,metric_key,target_value,current_value,bonus_amount,due_at,status)
      values(v_contract,v_season.id,'Sponsor target · '||v_focus,
        'Target performa berdasarkan Pool Sponsor v1.1 · '||v_tier,v_metric,v_target_value,0,v_bonus,
        (v_season.ends_on::timestamp at time zone 'UTC'),'in_progress');
    end loop;
    return jsonb_build_object('status','accepted','contract_id',v_contract,'duration_seasons',v_duration,'seasonal_bonus_pool',v_bonus);

  elsif p_action='reject' then
    select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
    if v_last.actor_kind<>'admin' then raise exception 'Menunggu respons sponsor.'; end if;
    update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
    update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
    return jsonb_build_object('status','rejected');
  else
    raise exception 'Action tidak dikenal.';
  end if;
end;
$function$;
