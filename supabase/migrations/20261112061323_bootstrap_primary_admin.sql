insert into public.site_admins (user_id)
values ('cf35c0be-f660-49ab-a56f-9a3080b8252d')
on conflict (user_id) do nothing;
update public.profiles
set onboarding_completed = true
where user_id = 'cf35c0be-f660-49ab-a56f-9a3080b8252d';
