-- Clear completed_at when a task is un-completed, and add 7-day auto-delete.

-- Update the trigger to also clear completed_at on un-complete.
create or replace function record_estimation() returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at = now();
    if new.estimate_min is not null then
      insert into estimation_stats (user_id, category, work_type, estimate_min, actual_min, task_id)
      values (coalesce(new.assignee_id, new.created_by), new.category, new.work_type,
              new.estimate_min, new.actual_min, new.id);
    end if;
  elsif new.status != 'completed' and old.status = 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

-- Auto-delete non-template tasks completed more than 7 days ago (runs 4 AM UTC daily).
select cron.schedule(
  'delete-old-completed-tasks',
  '0 4 * * *',
  $$
    delete from public.tasks
    where status = 'completed'
      and is_template = false
      and completed_at < now() - interval '7 days';
  $$
);
