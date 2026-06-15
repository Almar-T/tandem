-- ============================================================================
-- Tandem — initial schema, Row Level Security, and triggers.
-- Two trusted users (you + Max). Shared tables are readable/writable by any
-- authenticated user; settings + destructive deletes are owner-scoped.
-- Run via the Supabase SQL editor or `supabase db push`.
-- ============================================================================

-- ---------- enums ----------------------------------------------------------
create type task_status as enum ('not_started', 'in_progress', 'completed', 'overdue');
create type priority    as enum ('low', 'medium', 'high', 'urgent');
create type work_type    as enum ('deep_work', 'admin', 'meeting', 'creative', 'study', 'collab');
create type goal_status as enum ('active', 'achieved', 'paused', 'dropped');
create type idle_reason as enum ('reading', 'thinking', 'bathroom', 'call', 'meeting', 'other');

-- ---------- profiles (mirror of auth.users) --------------------------------
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  avatar_url   text,
  timezone     text not null default 'America/Chicago',
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a user is added in Auth.
create function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- goals + milestones ---------------------------------------------
create table goals (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  category    text,
  target_date date,
  status      goal_status not null default 'active',
  progress    numeric not null default 0 check (progress between 0 and 100),
  owner_id    uuid references profiles,           -- null = shared goal
  created_at  timestamptz not null default now()
);

create table milestones (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references goals on delete cascade,
  title       text not null,
  target_date date,
  done        boolean not null default false,
  sort_order  int not null default 0
);

-- ---------- tasks ----------------------------------------------------------
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  category        text,
  work_type       work_type,
  priority        priority not null default 'medium',
  status          task_status not null default 'not_started',
  due_date        timestamptz,
  assignee_id     uuid references profiles,
  goal_id         uuid references goals on delete set null,
  estimate_min    int,
  actual_min      int not null default 0,
  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  depends_on      uuid[],
  created_by      uuid references profiles,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tasks_assignee_idx on tasks (assignee_id);
create index tasks_status_idx   on tasks (status);
create index tasks_due_idx      on tasks (due_date);
create index tasks_goal_idx     on tasks (goal_id);

-- ---------- work sessions + screenshots ------------------------------------
create table work_sessions (
  id                   uuid primary key default gen_random_uuid(),
  task_id              uuid references tasks on delete set null,
  user_id              uuid not null references profiles,
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  active_sec           int not null default 0,
  idle_explained_sec   int not null default 0,
  idle_unexplained_sec int not null default 0,
  idle_reason          idle_reason,
  events               jsonb
);

create index work_sessions_user_idx on work_sessions (user_id, started_at);

create table screenshots (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references work_sessions on delete cascade,
  user_id      uuid not null references profiles,
  storage_path text not null,
  taken_at     timestamptz not null default now(),
  expires_at   timestamptz
);

-- ---------- AI learning + conversation -------------------------------------
create table estimation_stats (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles,
  category     text,
  work_type    work_type,
  estimate_min int,
  actual_min   int,
  task_id      uuid references tasks on delete set null,
  created_at   timestamptz not null default now()
);

create table ai_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles,
  role       text not null,                  -- user | assistant | tool
  content    text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create table daily_reports (
  id          uuid primary key default gen_random_uuid(),
  report_date date not null,
  user_id     uuid not null references profiles,
  summary     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (report_date, user_id)
);

-- ---------- push + settings ------------------------------------------------
create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

create table settings (
  user_id                   uuid primary key references profiles on delete cascade,
  screenshots_enabled       boolean not null default false,
  screenshot_freq_sec       int not null default 300,
  screenshot_retention_days int not null default 7,
  idle_threshold_sec        int not null default 180,
  ai_provider               text not null default 'gemini',
  work_hours                jsonb
);

-- ============================================================================
-- Triggers: keep updated_at fresh, roll work-session time onto the task, and
-- record estimate-vs-actual for the AI learning loop on completion.
-- ============================================================================
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_touch before update on tasks
  for each row execute function touch_updated_at();

-- When a session closes, add its active minutes to the linked task.
create function rollup_session_time() returns trigger language plpgsql as $$
begin
  if new.ended_at is not null and old.ended_at is null and new.task_id is not null then
    update tasks
      set actual_min = actual_min + round(new.active_sec / 60.0)
      where id = new.task_id;
  end if;
  return new;
end;
$$;

create trigger work_sessions_rollup after update on work_sessions
  for each row execute function rollup_session_time();

-- On task completion, snapshot estimate vs actual for learning.
create function record_estimation() returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at = now();
    if new.estimate_min is not null then
      insert into estimation_stats (user_id, category, work_type, estimate_min, actual_min, task_id)
      values (coalesce(new.assignee_id, new.created_by), new.category, new.work_type,
              new.estimate_min, new.actual_min, new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_record_estimation before update on tasks
  for each row execute function record_estimation();

-- ============================================================================
-- Row Level Security. Both users share the workspace, so shared tables are
-- open to any authenticated user. Settings + push subs are owner-scoped.
-- ============================================================================
alter table profiles           enable row level security;
alter table goals              enable row level security;
alter table milestones         enable row level security;
alter table tasks              enable row level security;
alter table work_sessions      enable row level security;
alter table screenshots        enable row level security;
alter table estimation_stats   enable row level security;
alter table ai_messages        enable row level security;
alter table daily_reports      enable row level security;
alter table push_subscriptions enable row level security;
alter table settings           enable row level security;

-- Helper: any signed-in user is one of the two trusted members.
-- Shared tables: full read/write for authenticated users.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','goals','milestones','tasks','work_sessions',
    'screenshots','estimation_stats','daily_reports'
  ] loop
    execute format(
      'create policy %1$s_rw on %1$I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ai_messages: each user sees only their own conversation.
create policy ai_messages_own on ai_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- push_subscriptions + settings: strictly owner-scoped.
create policy push_own on push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy settings_own on settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime: broadcast changes on the collaborative tables.
alter publication supabase_realtime add table tasks, goals, milestones, work_sessions;
