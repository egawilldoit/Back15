export const SCHEMA_VERSION = 1;

export const SCHEMA_V1_SQL = `
CREATE TABLE tracking_sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  reminder_window_end_at INTEGER NOT NULL,
  interval_seconds INTEGER NOT NULL DEFAULT 900,
  start_timezone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (interval_seconds > 0),
  CHECK (reminder_window_end_at > started_at),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK ((status = 'active' AND ended_at IS NULL)
      OR (status = 'closed' AND ended_at IS NOT NULL))
);

CREATE UNIQUE INDEX one_active_session
ON tracking_sessions(status) WHERE status = 'active';

CREATE INDEX sessions_by_start ON tracking_sessions(started_at DESC);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES tracking_sessions(id),
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('logged', 'skipped')),
  description TEXT,
  category TEXT CHECK (category IS NULL OR category IN
    ('work', 'learning', 'personal', 'break', 'other')),
  origin TEXT NOT NULL CHECK (origin IN ('typed', 'continued', 'backfilled', 'skipped')),
  client_action_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (end_at > start_at),
  CHECK ((kind = 'logged' AND length(trim(coalesce(description, ''))) > 0)
      OR (kind = 'skipped' AND description IS NULL AND category IS NULL))
);

CREATE INDEX entries_by_session_time ON entries(session_id, start_at, end_at);

CREATE UNIQUE INDEX entries_by_action_id
ON entries(client_action_id) WHERE client_action_id IS NOT NULL;

CREATE INDEX entries_by_time ON entries(start_at, end_at);

CREATE TABLE reminder_requests (
  session_id TEXT NOT NULL REFERENCES tracking_sessions(id),
  due_at INTEGER NOT NULL,
  native_request_id TEXT,
  PRIMARY KEY (session_id, due_at)
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const SETTING_KEYS = {
  remindersEnabled: 'reminders_enabled',
  lastObservedWallAt: 'last_observed_wall_at',
} as const;
