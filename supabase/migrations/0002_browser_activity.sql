-- Browser activity tracked by the Tandem browser extension.
-- Each row is a flush of keystrokes + clicks + time for one domain in a window.
-- Both users can see each other's activity (same open-workspace policy as work_sessions).

create table browser_activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles,
  recorded_at timestamptz not null default now(),
  domain      text not null,
  url         text not null,
  title       text,
  active_sec  int not null default 0,
  keystrokes  int not null default 0,
  clicks      int not null default 0
);

create index browser_activity_user_at on browser_activity (user_id, recorded_at);

alter table browser_activity enable row level security;

-- Shared read (any authenticated user sees both users); owner-only write.
create policy browser_activity_read on browser_activity
  for select to authenticated using (true);

create policy browser_activity_insert on browser_activity
  for insert to authenticated with check (user_id = auth.uid());

create policy browser_activity_delete on browser_activity
  for delete to authenticated using (user_id = auth.uid());
