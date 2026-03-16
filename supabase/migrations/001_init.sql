-- GeoTelegram – initial Supabase schema
-- Run this in your Supabase SQL editor before deploying the app.

CREATE TABLE IF NOT EXISTS public.tasks (
  id                TEXT        PRIMARY KEY,
  text              TEXT        NOT NULL,
  timestamp         TIMESTAMPTZ NOT NULL,
  status            TEXT        NOT NULL
                                CHECK (status IN ('found', 'possibly_found', 'not_found')),
  address_to_geocode TEXT,
  match_type        TEXT        CHECK (match_type IN ('exact', 'possible')),
  reason            TEXT,
  is_simulated      BOOLEAN     DEFAULT FALSE,
  is_raduzhnyi_zone BOOLEAN     DEFAULT FALSE,
  channel           TEXT,
  locations         JSONB       DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security
-- WARNING: The policy below allows unrestricted access for simplicity.
-- For production use, replace with authentication-based policies, e.g.:
--   USING (auth.uid() = user_id)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON public.tasks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- Indexes
CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON public.tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_channel_idx    ON public.tasks (channel);
