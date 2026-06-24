-- Recurring tasks: templates that spawn fresh instances each day via pg_cron.
--
-- Templates have is_template=true and a recurrence rule. They live in the
-- "Recurring" section of the task list but are never completed directly.
-- Each morning the spawn function creates a normal task instance from each
-- template whose rule matches today.

-- ── Schema ─────────────────────────────────────────────────────────────────

alter table tasks
  add column if not exists recurrence      text
    check (recurrence in ('daily', 'weekly', 'monthly')),
  add column if not exists recurrence_days integer[] not null default '{}',
  add column if not exists is_template     boolean   not null default false,
  add column if not exists template_id     uuid      references tasks(id) on delete set null;

create index if not exists idx_tasks_is_template
  on tasks(is_template) where is_template = true;

-- ── Spawn function ──────────────────────────────────────────────────────────
-- Creates one task instance per template per day it qualifies.
-- Safe to call multiple times (idempotent via due_date check).

create or replace function public.spawn_recurring_tasks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today_date  date := current_date;
  today_dow   int  := extract(isodow from current_date)::int;  -- 1=Mon … 7=Sun
  today_dom   int  := extract(day   from current_date)::int;   -- 1–31
  tmpl        record;
  already     int;
begin
  for tmpl in
    select * from tasks
    where is_template = true and recurrence is not null
  loop
    -- Skip if already spawned for today
    select count(*) into already
      from tasks
     where template_id = tmpl.id
       and due_date >= today_date::timestamptz
       and due_date <  (today_date + interval '1 day')::timestamptz;

    if already > 0 then continue; end if;

    -- Check recurrence rule
    if tmpl.recurrence = 'daily' then
      null; -- always spawn
    elsif tmpl.recurrence = 'weekly' then
      if not (today_dow = any(coalesce(tmpl.recurrence_days, '{}'::integer[]))) then
        continue;
      end if;
    elsif tmpl.recurrence = 'monthly' then
      if not (today_dom = any(coalesce(tmpl.recurrence_days, '{}'::integer[]))) then
        continue;
      end if;
    else
      continue;
    end if;

    -- Spawn instance (due at end of today)
    insert into tasks (
      title, description, category, work_type, priority,
      assignee_id, goal_id, estimate_min, show_on_calendar,
      created_by, due_date, status, template_id, is_template
    ) values (
      tmpl.title, tmpl.description, tmpl.category, tmpl.work_type, tmpl.priority,
      tmpl.assignee_id, tmpl.goal_id, tmpl.estimate_min, tmpl.show_on_calendar,
      tmpl.created_by,
      (today_date + interval '23 hours 59 minutes')::timestamptz,
      'not_started',
      tmpl.id,
      false
    );
  end loop;
end;
$$;

-- ── pg_cron schedule ────────────────────────────────────────────────────────
-- Runs at 12:00 UTC = 7:00 AM CDT each morning.

do $$
begin
  perform cron.unschedule('hearth-spawn-recurring');
exception when others then null;
end;
$$;

select cron.schedule(
  'hearth-spawn-recurring',
  '0 12 * * *',
  $$select public.spawn_recurring_tasks();$$
);
