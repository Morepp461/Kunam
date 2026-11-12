-- Team takeover listing, offer/counter negotiation, and FIA review.
create unique index if not exists caleris_team_takeover_one_open_per_team
 on public.caleris_team_takeovers(target_team_id)
 where status in ('offered','negotiating','seller_accepted','pending_fia','approved');

create or replace function public.member_set_team_takeover_listing(p_is_listed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.members%rowtype;
begin
 select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
 if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Akses Team Owner/Principal diperlukan.'; end if;
 update public.teams set takeover_listed=p_is_listed where id=v_member.team_id;
 return jsonb_build_object('team_id',v_member.team_id,'takeover_listed',p_is_listed);
end;
$$;
revoke all on function public.member_set_team_takeover_listing(boolean) from public,anon,service_role;
grant execute on function public.member_set_team_takeover_listing(boolean) to authenticated;

create or replace function public.member_start_team_takeover(p_target_team_id uuid,p_offer_amount numeric,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor public.members%rowtype;v_target public.teams%rowtype;v_seller public.members%rowtype;
 v_valuation public.caleris_team_valuations%rowtype;v_range public.caleris_configurations%rowtype;
 v_min numeric;v_max numeric;v_id uuid;
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
 if not found or v_actor.role not in ('Owner','Principal') or v_actor.team_id is null then raise exception 'Akses Team Owner/Principal diperlukan.'; end if;
 if v_actor.team_id=p_target_team_id then raise exception 'Tidak dapat mengambil alih tim sendiri.'; end if;
 select * into v_target from public.teams where id=p_target_team_id and takeover_listed;
 if not found then raise exception 'Tim target tidak sedang membuka Take Over.'; end if;
 select * into v_seller from public.members where team_id=p_target_team_id and role in ('Owner','Principal') order by case when role='Owner' then 0 else 1 end,id limit 1;
 if not found then raise exception 'Tim target belum memiliki Team Owner/Principal.'; end if;
 select * into v_valuation from public.caleris_team_valuations where team_id=p_target_team_id order by assessed_at desc limit 1;
 if not found then raise exception 'Tim target belum memiliki valuation snapshot.'; end if;
 select * into v_range from public.caleris_configurations where category='economy' and config_key='team-takeover-valuation-range' and is_active;
 v_min:=nullif(v_range.payload->>'minimum_percent','')::numeric;v_max:=nullif(v_range.payload->>'maximum_percent','')::numeric;
 if v_min is null or v_max is null or v_min<0 or v_max<v_min then raise exception 'Admin belum mengatur rentang valuasi Take Over.'; end if;
 if p_offer_amount is null or p_offer_amount<=0 or p_offer_amount<>round(p_offer_amount,2) then raise exception 'Nominal penawaran tidak valid.'; end if;
 if p_offer_amount<v_valuation.total_valuation*v_min/100 or p_offer_amount>v_valuation.total_valuation*v_max/100 then
  raise exception 'Penawaran harus berada dalam rentang valuasi yang dikonfigurasi Admin (%–% dari valuasi).',v_min,v_max;
 end if;
 if exists(select 1 from public.caleris_team_takeovers where target_team_id=p_target_team_id and status in ('offered','negotiating','seller_accepted','pending_fia','approved')) then raise exception 'Tim ini sudah memiliki negosiasi Take Over yang berjalan.'; end if;
 insert into public.caleris_team_takeovers(target_team_id,buyer_member_id,seller_member_id,valuation_id,status)
 values(p_target_team_id,v_actor.id,v_seller.id,v_valuation.id,'offered') returning id into v_id;
 insert into public.caleris_team_takeover_offers(takeover_id,offered_by_member_id,offered_amount,note)
 values(v_id,v_actor.id,p_offer_amount,nullif(trim(p_note),'')); 
 return v_id;
end;
$$;
revoke all on function public.member_start_team_takeover(uuid,numeric,text) from public,anon,service_role;
grant execute on function public.member_start_team_takeover(uuid,numeric,text) to authenticated;

create or replace function public.member_respond_team_takeover(
 p_takeover_id uuid,p_action text,p_amount numeric default null,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.members%rowtype;v_take public.caleris_team_takeovers%rowtype;
 v_last public.caleris_team_takeover_offers%rowtype;v_last_team uuid;v_limits public.caleris_configurations%rowtype;
 v_range public.caleris_configurations%rowtype;v_max_side integer;v_max_total integer;v_min numeric;v_max numeric;
 v_side_count integer;v_total_count integer;
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
 if not found or v_actor.role not in ('Owner','Principal') or v_actor.team_id is null then raise exception 'Akses Team Owner/Principal diperlukan.'; end if;
 select * into v_take from public.caleris_team_takeovers where id=p_takeover_id for update;
 if not found or v_take.status not in ('offered','negotiating') then raise exception 'Negosiasi Take Over tidak tersedia.'; end if;
 if v_actor.team_id not in (v_take.target_team_id,(select team_id from public.members where id=v_take.buyer_member_id)) then raise exception 'Tim kamu bukan pihak dalam negosiasi ini.'; end if;
 select * into v_last from public.caleris_team_takeover_offers where takeover_id=v_take.id order by created_at desc,id desc limit 1;
 select team_id into v_last_team from public.members where id=v_last.offered_by_member_id;
 if v_last.id is null or v_last_team=v_actor.team_id then raise exception 'Pihak yang sama tidak dapat merespons penawarannya sendiri.'; end if;
 if p_action='reject' then
  update public.caleris_team_takeover_offers set response='rejected' where id=v_last.id;
  update public.caleris_team_takeovers set status='rejected',updated_at=now() where id=v_take.id;
  return jsonb_build_object('status','rejected');
 elsif p_action='accept' then
  update public.caleris_team_takeover_offers set response='accepted' where id=v_last.id;
  update public.caleris_team_takeovers set status='pending_fia',agreed_amount=v_last.offered_amount,updated_at=now() where id=v_take.id;
  return jsonb_build_object('status','pending_fia','agreed_amount',v_last.offered_amount);
 elsif p_action='counter' then
  select * into v_limits from public.caleris_configurations where category='economy' and config_key='team-takeover-negotiation-limits' and is_active;
  v_max_side:=nullif(v_limits.payload->>'max_counters_per_side','')::integer;v_max_total:=nullif(v_limits.payload->>'max_total_counters','')::integer;
  if v_max_side is null or v_max_total is null or v_max_side<0 or v_max_total<0 then raise exception 'Admin belum mengatur batas counter-offer Take Over.'; end if;
  if p_amount is null or p_amount<=v_last.offered_amount or p_amount<>round(p_amount,2) then raise exception 'Counter-offer wajib lebih tinggi dari penawaran sebelumnya.'; end if;
  select * into v_range from public.caleris_configurations where category='economy' and config_key='team-takeover-valuation-range' and is_active;
  v_min:=nullif(v_range.payload->>'minimum_percent','')::numeric;v_max:=nullif(v_range.payload->>'maximum_percent','')::numeric;
  if v_min is null or v_max is null or v_min<0 or v_max<v_min then raise exception 'Admin belum mengatur rentang valuasi Take Over dengan benar.';end if;
  if p_amount<(select total_valuation from public.caleris_team_valuations where id=v_take.valuation_id)*v_min/100
    or p_amount>(select total_valuation from public.caleris_team_valuations where id=v_take.valuation_id)*v_max/100 then
   raise exception 'Counter-offer berada di luar rentang valuasi yang dikonfigurasi Admin.';
  end if;
  select count(*) into v_side_count from public.caleris_team_takeover_offers o join public.members m on m.id=o.offered_by_member_id where o.takeover_id=v_take.id and m.team_id=v_actor.team_id;
  if v_actor.team_id=(select team_id from public.members where id=v_take.buyer_member_id) then v_side_count:=greatest(v_side_count-1,0);end if;
  select count(*)-1 into v_total_count from public.caleris_team_takeover_offers where takeover_id=v_take.id;
  if v_side_count>=v_max_side or v_total_count>=v_max_total then raise exception 'Batas negosiasi ulang telah tercapai.';end if;
  update public.caleris_team_takeover_offers set response='countered' where id=v_last.id;
  insert into public.caleris_team_takeover_offers(takeover_id,offered_by_member_id,offered_amount,note)
  values(v_take.id,v_actor.id,p_amount,nullif(trim(p_note),'')); 
  update public.caleris_team_takeovers set status='negotiating',total_counteroffers=total_counteroffers+1,updated_at=now() where id=v_take.id;
  return jsonb_build_object('status','negotiating','counteroffers',v_total_count+1);
 else raise exception 'Action negosiasi tidak dikenal.';end if;
end;
$$;
revoke all on function public.member_respond_team_takeover(uuid,text,numeric,text) from public,anon,service_role;
grant execute on function public.member_respond_team_takeover(uuid,text,numeric,text) to authenticated;

create or replace function public.fia_review_team_takeover(p_takeover_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_take public.caleris_team_takeovers%rowtype;
begin
 if not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat meninjau Take Over.';end if;
 select * into v_take from public.caleris_team_takeovers where id=p_takeover_id for update;
 if not found or v_take.status<>'pending_fia' then raise exception 'Take Over belum siap ditinjau FIA.';end if;
 update public.caleris_team_takeovers set status=case when p_approve then 'approved' else 'rejected' end,updated_at=now() where id=v_take.id;
 return jsonb_build_object('status',case when p_approve then 'approved_pending_execution_rules' else 'rejected' end);
end;
$$;
revoke all on function public.fia_review_team_takeover(uuid,boolean) from public,anon,service_role;
grant execute on function public.fia_review_team_takeover(uuid,boolean) to authenticated;
