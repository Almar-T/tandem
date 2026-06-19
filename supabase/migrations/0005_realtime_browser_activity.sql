-- Enable Realtime for browser_activity so HearthHall can subscribe to
-- extension-detected clicks/keystrokes and use them for idle detection.
alter publication supabase_realtime add table browser_activity;
