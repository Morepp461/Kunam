begin;

-- Sponsor logo assets: public read for offers; writes restricted to site admins.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sponsor-logos','sponsor-logos',true,1048576,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=1048576,allowed_mime_types=array['image/png','image/jpeg','image/webp'];

drop policy if exists "Sponsor logos public read" on storage.objects;
create policy "Sponsor logos public read" on storage.objects for select to public
using(bucket_id='sponsor-logos');

drop policy if exists "Admins upload sponsor logos" on storage.objects;
create policy "Admins upload sponsor logos" on storage.objects for insert to authenticated
with check(bucket_id='sponsor-logos' and exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

drop policy if exists "Admins update sponsor logos" on storage.objects;
create policy "Admins update sponsor logos" on storage.objects for update to authenticated
using(bucket_id='sponsor-logos' and exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check(bucket_id='sponsor-logos' and exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

drop policy if exists "Admins delete sponsor logos" on storage.objects;
create policy "Admins delete sponsor logos" on storage.objects for delete to authenticated
using(bucket_id='sponsor-logos' and exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

-- Scale official cash rewards by authoritative division tier:
-- Premio 100%, Zwei 90%, then 80%, 70%, etc. All payout paths remain idempotent.
do $$
declare
  v_def text;
  v_old text;
begin
  v_def:=pg_get_functiondef('private.sync_official_race_cash_and_maintenance(uuid)'::regprocedure);
  v_old:='v_wallet uuid; v_source uuid; v_destination uuid; v_tx jsonb; v_amount numeric(20,2); v_winner_team uuid; v_has_existing boolean; v_has_charge boolean;';
  if position(v_old in v_def)=0 then raise exception 'Race settlement declaration changed; migration aborted safely.'; end if;
  v_def:=replace(v_def,v_old,v_old||' v_division_key text; v_division_tier integer; v_reward_multiplier numeric(8,4);');

  v_old:='  if not found or v_round.status<>''closed'' then return; end if;';
  if position(v_old in v_def)=0 then raise exception 'Race settlement close guard changed; migration aborted safely.'; end if;
  v_def:=replace(v_def,v_old,v_old||E'\n  select lower(d.division_key) into v_division_key from public.license_rounds r join public.license_season_divisions d on d.id=r.season_division_id where r.id=p_round_id;\n  if v_division_key=''premio'' then v_division_tier:=1;\n  elsif v_division_key=''zwei'' then v_division_tier:=2;\n  else\n    select 2+ranked.tier_offset into v_division_tier from (select division_key,row_number() over(order by first_created,division_key)::integer tier_offset from (select lower(division_key) division_key,min(created_at) first_created from public.license_season_divisions where lower(division_key) not in (''premio'',''zwei'') group by lower(division_key)) d) ranked where ranked.division_key=v_division_key;\n    if v_division_tier is null then select 3+count(distinct lower(division_key)) into v_division_tier from public.license_season_divisions where lower(division_key) not in (''premio'',''zwei''); end if;\n  end if;\n  v_reward_multiplier:=greatest(0,1-(greatest(v_division_tier,1)-1)*0.10);');

  v_old:='v_amount:=case when v_entry.finish_status=''finished'' and v_entry.finishing_position=1 then 1000000 when v_entry.finish_status=''finished'' and v_entry.finishing_position=2 then 750000 when v_entry.finish_status=''finished'' and v_entry.finishing_position=3 then 500000 else 0 end;';
  if position(v_old in v_def)=0 then raise exception 'Driver race reward calculation changed; migration aborted safely.'; end if;
  v_def:=replace(v_def,v_old,'v_amount:=case when v_entry.finish_status=''finished'' and v_entry.finishing_position=1 then round(1000000*v_reward_multiplier,2) when v_entry.finish_status=''finished'' and v_entry.finishing_position=2 then round(750000*v_reward_multiplier,2) when v_entry.finish_status=''finished'' and v_entry.finishing_position=3 then round(500000*v_reward_multiplier,2) else 0 end;');

  v_old:='v_tx:=private.post_economy_transaction(v_bank,v_wallet,1000000,''prize'',''Race team reward · Round ''||v_round.round_number';
  if position(v_old in v_def)=0 then raise exception 'Team race reward calculation changed; migration aborted safely.'; end if;
  v_def:=replace(v_def,v_old,'v_tx:=private.post_economy_transaction(v_bank,v_wallet,round(1000000*v_reward_multiplier,2),''prize'',''Race team reward · Round ''||v_round.round_number');

  v_old:='values(p_round_id,''team'',v_winner_team,1000000,(v_tx->>''transaction_id'')::uuid)';
  if position(v_old in v_def)=0 then raise exception 'Team race reward record changed; migration aborted safely.'; end if;
  v_def:=replace(v_def,v_old,'values(p_round_id,''team'',v_winner_team,round(1000000*v_reward_multiplier,2),(v_tx->>''transaction_id'')::uuid)');
  execute v_def;
end $$;

commit;