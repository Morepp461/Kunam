begin;
do $$
declare v_def text; v_old text;
begin
  v_def:=pg_get_functiondef('private.execute_approved_driver_move(uuid)'::regprocedure);
  v_old:=$old$v_total:=v_neg.agreed_amount+v_tax;$old$;
  if position(v_old in v_def)=0 then raise exception 'Driver transfer tax settlement block changed; aborting safely.'; end if;
  v_def:=replace(v_def,v_old,'v_tax:=0; v_total:=v_neg.agreed_amount;');
  execute v_def;

  v_def:=pg_get_functiondef('public.fia_review_driver_move(uuid,boolean)'::regprocedure);
  v_old:=$old$else
    if not exists(
      select 1 from public.caleris_tax_rules
      where tax_type='driver_transfer' and is_active
    ) then
      raise exception 'Admin belum mengaktifkan konfigurasi Driver Transfer Tax.';
    end if;
  end if;$old$;
  if position(v_old in v_def)=0 then raise exception 'Driver transfer tax approval gate changed; aborting safely.'; end if;
  v_def:=replace(v_def,v_old,$new$else
    null;
  end if;$new$);
  execute v_def;
end $$;
update public.caleris_tax_rules set is_active=false,updated_at=now() where tax_type='driver_transfer' and is_active;
commit;
