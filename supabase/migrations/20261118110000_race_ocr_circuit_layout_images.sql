begin;
alter table public.caleris_circuits add column if not exists image_url text;
create or replace view public.caleris_circuit_pool with (security_barrier=true) as
select c.id,c.name,c.country_code,c.image_url,c.total_laps,c.avg_track_temp_c,c.drs_zones,c.straights,c.low_speed_corners,c.high_speed_corners,c.grip_level,
 least(c.initial_lap_record_ms,(select min(e.fastest_lap_ms) from public.license_rounds r join public.caleris_race_result_entries e on e.round_id=r.id where lower(trim(r.circuit_name))=lower(trim(c.name)) and r.circuit_country_code=c.country_code and e.fastest_lap_ms is not null)) as lap_record_ms
from public.caleris_circuits c;
revoke all on public.caleris_circuit_pool from public,anon,authenticated,service_role;
grant select on public.caleris_circuit_pool to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('circuit-layouts','circuit-layouts',true,4194304,array['image/webp']) on conflict(id) do update set public=true,file_size_limit=4194304,allowed_mime_types=array['image/webp'];
drop policy if exists "Public read circuit layouts" on storage.objects;
create policy "Public read circuit layouts" on storage.objects for select to anon,authenticated using(bucket_id='circuit-layouts');
drop policy if exists "FIA upload circuit layouts" on storage.objects;
create policy "FIA upload circuit layouts" on storage.objects for insert to authenticated with check(bucket_id='circuit-layouts' and public.is_caleris_fia_or_admin());
drop policy if exists "FIA update circuit layouts" on storage.objects;
create policy "FIA update circuit layouts" on storage.objects for update to authenticated using(bucket_id='circuit-layouts' and public.is_caleris_fia_or_admin()) with check(bucket_id='circuit-layouts' and public.is_caleris_fia_or_admin());
drop policy if exists "FIA delete circuit layouts" on storage.objects;
create policy "FIA delete circuit layouts" on storage.objects for delete to authenticated using(bucket_id='circuit-layouts' and public.is_caleris_fia_or_admin());
commit;