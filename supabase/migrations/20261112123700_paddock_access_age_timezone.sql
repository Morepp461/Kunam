alter table public.profiles drop constraint if exists profiles_minimum_age_check;
alter table public.profiles add constraint profiles_minimum_age_check
check (date_of_birth is null or date_of_birth <= (((now() at time zone 'Asia/Jakarta')::date - interval '13 years')::date));
