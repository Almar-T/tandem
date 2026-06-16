create table desktop_activity (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles,
  recorded_at  timestamptz not null default now(),
  app_name     text not null,
  window_title text,
  active_sec   int not null default 0
);

create index desktop_activity_user_at on desktop_activity (user_id, recorded_at);

alter table desktop_activity enable row level security;

create policy desktop_activity_read on desktop_activity
  for select to authenticated using (true);

create policy desktop_activity_insert on desktop_activity
  for insert to authenticated with check (user_id = auth.uid());
