-- HearthHall scheduled notifications
-- Run this once in: Supabase Dashboard → SQL Editor
--
-- Before running, replace YOUR_CRON_SECRET below with the value of the
-- CRON_SECRET secret you set in Edge Functions secrets.
-- (Dashboard → Edge Functions → notify → Secrets)

-- Make sure extensions are enabled (safe to run if already on)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Morning recap — fires at 13:00 UTC = 8:00 AM CDT every day
--    Sends yesterday's accomplishments to both users.
select cron.schedule(
  'hearth-morning-recap',
  '0 13 * * *',
  $$
  select net.http_post(
    url     := 'https://zcyxixadcqmwarmnysxg.supabase.co/functions/v1/notify',
    headers := '{"Content-Type":"application/json","x-cron-secret":"YOUR_CRON_SECRET"}'::jsonb,
    body    := '{"mode":"morning"}'::jsonb
  ) as request_id;
  $$
);

-- 2. End-of-day fallback — fires at 02:00 UTC = 9:00 PM CDT
--    Catches days where nobody hit the End Day button.
select cron.schedule(
  'hearth-eod-fallback',
  '0 2 * * *',
  $$
  select net.http_post(
    url     := 'https://zcyxixadcqmwarmnysxg.supabase.co/functions/v1/notify',
    headers := '{"Content-Type":"application/json","x-cron-secret":"YOUR_CRON_SECRET"}'::jsonb,
    body    := '{"mode":"eod"}'::jsonb
  ) as request_id;
  $$
);

-- To verify jobs were created:
-- select jobname, schedule, command from cron.job;

-- To remove a job if needed:
-- select cron.unschedule('hearth-morning-recap');
-- select cron.unschedule('hearth-eod-fallback');
