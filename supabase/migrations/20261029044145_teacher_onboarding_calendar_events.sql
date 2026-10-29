alter table public.teacher_profiles
  add column if not exists gender text not null default '',
  add column if not exists modality text not null default '',
  add column if not exists subjects text[] not null default '{}',
  add column if not exists teacher_context jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed boolean not null default false;

alter table public.teacher_profiles
  drop constraint if exists teacher_profiles_gender_check,
  add constraint teacher_profiles_gender_check check (gender in ('', 'mujer', 'varon')),
  drop constraint if exists teacher_profiles_modality_check,
  add constraint teacher_profiles_modality_check check (modality in ('', 'primaria', 'secundaria'));

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  event_type text not null check (event_type in ('actividad', 'festival', 'feriado')),
  start_date date not null,
  end_date date,
  start_time time,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

alter table public.calendar_events enable row level security;
grant select, insert, update, delete on public.calendar_events to authenticated;
drop policy if exists "teachers manage own calendar events" on public.calendar_events;
create policy "teachers manage own calendar events" on public.calendar_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create index if not exists calendar_events_user_date_idx on public.calendar_events(user_id, start_date, end_date);
