alter table public.teacher_profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '';

update public.teacher_profiles
set first_name = split_part(trim(full_name), ' ', 1),
    last_name = btrim(substr(trim(full_name), length(split_part(trim(full_name), ' ', 1)) + 1))
where btrim(full_name) <> ''
  and first_name = ''
  and last_name = '';
