-- Complete Development notifications for Team Development and token shop purchases.
create or replace function private.notify_team_development()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_recipient uuid;
begin
 for v_recipient in select m.id from public.members m where m.team_id=new.team_id and m.role='Owner' loop
  perform private.enqueue_caleris_notification(v_recipient,'development','Team Development berhasil',
   new.part_key||' meningkat dari '||new.previous_value::text||' menjadi '||new.new_value::text||'.',
   '/development','team-development:'||new.id::text||':'||v_recipient::text,
   jsonb_build_object('history_id',new.id,'team_id',new.team_id,'part_key',new.part_key,'tdp_spent',new.tdp_spent,'cash_eur_spent',new.cash_eur_spent));
 end loop;
 return new;
end;
$function$;
drop trigger if exists caleris_team_development_notification_trigger on public.caleris_team_development_part_history;
create trigger caleris_team_development_notification_trigger after insert on public.caleris_team_development_part_history
for each row execute function private.notify_team_development();

create or replace function private.notify_development_shop_purchase()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
 perform private.enqueue_caleris_notification(new.member_id,'development','Token Development dibeli',
  'Pembelian '||new.token_type||' sebanyak '||new.quantity::text||' token berhasil diproses.','/shop',
  'development-shop-purchase:'||new.id::text,
  jsonb_build_object('purchase_id',new.id,'token_type',new.token_type,'quantity',new.quantity,'total_price',new.total_price));
 return new;
end;
$function$;
drop trigger if exists caleris_development_shop_purchase_notification_trigger on public.caleris_development_shop_purchases;
create trigger caleris_development_shop_purchase_notification_trigger after insert on public.caleris_development_shop_purchases
for each row execute function private.notify_development_shop_purchase();
