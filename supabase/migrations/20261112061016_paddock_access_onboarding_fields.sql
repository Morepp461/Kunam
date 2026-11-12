alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists date_of_birth date,
  add column if not exists preferred_role text,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists onboarding_completed boolean not null default false;

alter table public.profiles drop constraint if exists profiles_preferred_role_check;
alter table public.profiles add constraint profiles_preferred_role_check
  check (preferred_role is null or preferred_role in ('FIA','Team Owner','Driver'));
alter table public.profiles drop constraint if exists profiles_minimum_age_check;
alter table public.profiles add constraint profiles_minimum_age_check
  check (date_of_birth is null or date_of_birth <= (current_date - interval '13 years')::date);
alter table public.profiles drop constraint if exists profiles_name_length_check;
alter table public.profiles add constraint profiles_name_length_check
  check ((first_name is null or char_length(first_name) <= 80)
     and (last_name is null or char_length(last_name) <= 80)
     and (web_nickname is null or char_length(web_nickname) <= 32));
update public.profiles set onboarding_completed = true
where user_id = 'cf35c0be-f660-49ab-a56f-9a3080b8252d';
