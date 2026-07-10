-- Google Calendar OAuth connections (one row per connected Google account).
-- refresh_token is hidden from the authenticated role — only the service-role
-- key (used by the gcal Edge Function) can read it.

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_email  text        NOT NULL,
  access_token   text        NOT NULL,
  refresh_token  text        NOT NULL,
  token_expiry   timestamptz NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_connections"
  ON public.calendar_connections
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Clients can read everything EXCEPT the refresh token.
REVOKE SELECT (refresh_token) ON public.calendar_connections FROM authenticated;
