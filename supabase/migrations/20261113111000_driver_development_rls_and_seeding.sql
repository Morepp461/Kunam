drop policy if exists driver_development_attributes_read on public.caleris_driver_development_attributes;
create policy driver_development_attributes_read on public.caleris_driver_development_attributes for select to authenticated using(
 exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.member_id=caleris_driver_development_attributes.member_id)
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and m.role='Admin')
);
drop policy if exists driver_development_history_read on public.caleris_driver_development_history;
create policy driver_development_history_read on public.caleris_driver_development_history for select to authenticated using(
 exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.member_id=caleris_driver_development_history.member_id)
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and m.role='Admin')
);
create or replace function public.seed_driver_development_attributes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='Driver' then
  insert into public.caleris_driver_development_attributes(member_id,attribute_key)
  select new.id,a.attribute_key from (select unnest(array['race_pace','qualifying_pace','experience','aggression','defensive_strength','overtake_skill','mistake_rate','tyre_management']) attribute_key) a
  on conflict(member_id,attribute_key) do nothing;
 end if;
 return new;
end; $$;
drop trigger if exists members_seed_driver_development_attributes on public.members;
create trigger members_seed_driver_development_attributes after insert or update of role on public.members for each row execute function public.seed_driver_development_attributes();