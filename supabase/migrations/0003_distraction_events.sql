create table distraction_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles,
  recorded_at timestamptz not null default now(),
  domain      text not null,
  reason      text,
  action      text not null,  -- 'explained' | 'break' | 'lock_in'
  ai_approved boolean,
  ai_message  text
);

create index distraction_events_user_at on distraction_events (user_id, recorded_at);

alter table distraction_events enable row level security;

-- Both users see each other's events for mutual accountability.
create policy distraction_read on distraction_events
  for select to authenticated using (true);

create policy distraction_insert on distraction_events
  for insert to authenticated with check (user_id = auth.uid());
