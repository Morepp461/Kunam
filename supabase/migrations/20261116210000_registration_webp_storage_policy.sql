-- Registration images are normalized to WebP in the browser before Storage upload.
-- Keep legacy objects readable; this restricts new uploads only.
do $migration$
begin
  if not exists (select 1 from storage.buckets where id='profile-avatars') then
    raise exception 'Required Storage bucket profile-avatars does not exist.';
  end if;
  if not exists (select 1 from storage.buckets where id='team-logos') then
    raise exception 'Required Storage bucket team-logos does not exist.';
  end if;
end;
$migration$;

update storage.buckets
set allowed_mime_types=array['image/webp'], file_size_limit=1048576
where id='profile-avatars';

update storage.buckets
set allowed_mime_types=array['image/webp'], file_size_limit=786432
where id='team-logos';