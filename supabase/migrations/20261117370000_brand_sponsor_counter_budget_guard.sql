create or replace function private.sponsor_engine_respond(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_offer public.caleris_sponsorship_offers%rowtype;
  v_sponsor public.caleris_sponsors%rowtype;
  v_last public.caleris_sponsorship_offer_revisions%rowtype;
  v_initial numeric;v_limit numeric;v_amount numeric;v_response text;
begin
  select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
  if not found or v_offer.target_kind<>'team' or v_offer.status<>'negotiating' then return jsonb_build_object('status','not_waiting'); end if;
  if v_offer.expires_at is not null and now()>v_offer.expires_at then
    update public.caleris_sponsorship_offers set status='expired' where id=v_offer.id;
    return jsonb_build_object('status','expired');
  end if;
  select * into v_sponsor from public.caleris_sponsors where id=v_offer.sponsor_id for update;
  select * into v_last from public.caleris_sponsorship_offer_revisions
  where offer_id=v_offer.id order by created_at desc,id desc limit 1;
  if not found or v_last.actor_kind<>'member' then return jsonb_build_object('status','not_waiting'); end if;
  select amount into v_initial from public.caleris_sponsorship_offer_revisions
  where offer_id=v_offer.id order by created_at,id limit 1;
  v_limit:=v_initial*(1+v_sponsor.flexibility_percent/100);

  if v_last.amount<=v_limit
    and (v_sponsor.available_budget is null or v_sponsor.available_budget>=v_last.amount) then
    v_amount:=v_last.amount;v_response:='accepted';
  elsif v_offer.counter_count<3
    and (v_sponsor.available_budget is null or v_sponsor.available_budget>=v_initial) then
    v_amount:=least(v_limit,greatest(v_initial,v_last.amount*0.95),coalesce(v_sponsor.available_budget,v_limit));
    v_response:='countered';
  else
    update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
    update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
    return jsonb_build_object('status','rejected','counter_count',v_offer.counter_count);
  end if;

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