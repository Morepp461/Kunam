insert into public.caleris_driver_salary_bands(license_label,license_tier,salary_min_eur,salary_max_eur,sort_order)
values('A','super',22600000,45000000,5)
on conflict(license_label) do update set license_tier=excluded.license_tier,salary_min_eur=excluded.salary_min_eur,salary_max_eur=excluded.salary_max_eur,sort_order=excluded.sort_order;