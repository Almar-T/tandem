-- Plan for the Day: per-user daily schedule stored as JSONB slots.
-- Each slot: { title, start "HH:MM", end "HH:MM", task_id?, work_type?, is_break }

create table if not exists day_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  plan_date   date not null,
  slots       jsonb not null default '[]'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (user_id, plan_date)
);

alter table day_plans enable row level security;

-- Any authenticated member can read all plans (shared workspace).
create policy "members can read day_plans"
  on day_plans for select
  using (auth.role() = 'authenticated');

-- Each user can only write their own plan.
create policy "users manage own day_plans"
  on day_plans for all
  using (auth.uid() = user_id);

-- Realtime
alter publication supabase_realtime add table day_plans;
