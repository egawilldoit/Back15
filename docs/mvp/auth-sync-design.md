# Back15 optional accounts and sync — design decisions

Status: **design only**. No Supabase project, URL, anon key, CLI session, or
dashboard access exists in this environment, so no auth code, tables, or RLS
policies have been implemented or run. Local tracking, Today, History and
reminders remain offline-first and account-free; nothing in this document
changes V0.1 behavior.

## 1. Local-only users and optional sign-in

- The journal works forever without an account. Sign-in is additive and never
  required to Start, capture, Stop, edit, view history, or receive reminders.
- The signed-out state is a first-class state, not an error: Today, History,
  Settings and reminders must behave identically signed in or out, and offline.
- Sign-in is only offered where it unlocks something the user asked for
  (backup and multi-device restore). It is never presented as onboarding.

## 2. Ownership of journal data already on a phone

- Data created before sign-in belongs to the device's local journal and to the
  person holding the phone. Signing in does **not** silently upload it.
- The first upload is an explicit action ("Back up this journal"), scoped to
  the signed-in account. Until that action, the account has zero rows.
- An account owns only rows it explicitly uploaded (or restored from its own
  backup). There is no implicit claim over rows created on another device while
  signed out, even if that device later signs in.

## 3. Sign-out and account switching

- Sign-out stops remote access and clears the native auth session and any
  cached remote rows; it never deletes the local journal.
- The local journal is bound to a `journal_owner` marker: `local` while signed
  out, or the account id after an explicit upload. Signing in with a different
  account while the local journal is bound to another account must not expose
  or upload those rows. The switch flow offers: keep this device's journal
  local-only, or start from the new account's remote data after an explicit
  confirmation. The default is local-only.
- Queries on the device always filter by owner: remote reads request only the
  signed-in account's rows, and local rows from a different owner are never
  merged into the account's view without an explicit import.

## 4. Offline writes and retries

- SQLite stays the source of truth for reads and writes. The UI never waits on
  the network: a write commits locally, is appended to an outbox, and the
  outbox drains when connectivity returns.
- The outbox stores intent, not state: `{operation, rowId, revisionAtWrite,
  payload, clientActionId}`. Retries replay the same intent; a replay that
  finds a newer remote revision surfaces a conflict instead of overwriting.
- Uploads are attempted on app foreground, after a local write, and on
  connectivity regain. Failures back off exponentially with jitter and never
  surface as data loss: the local row is already committed.

## 5. IDs, tombstones, revisions, upload idempotency

- Row ids stay client-generated strings (the same ids SQLite already uses), so
  a row keeps its identity across devices and uploads. No server-side id
  rewriting.
- `client_action_id` remains the create idempotency key: the remote table has a
  unique constraint on `(owner_id, client_action_id)` and uploads use
  `insert ... on conflict do nothing`, so a retried create can never duplicate.
- `revision` is an integer per row. An update is accepted only when the remote
  revision equals the revision the client last saw; otherwise the write is
  rejected as a conflict (HTTP 409) and the client must resolve.
- Deletes are tombstones (`deleted_at`), never row removals, so a delete can
  travel to other devices and be replayed idempotently.
- Timestamps are UTC milliseconds, half-open `[start_at, end_at)` ranges, and
  the same overlap rule as local storage (no overlapping live entries inside a
  session). The server validates the same invariants; it is not a blind store.

## 6. Two devices editing overlapping time

- Time is the conflict surface: two devices can legitimately create entries
  over the same span while offline. Uploads therefore validate overlap per
  session server-side and reject the later conflicting write with the
  conflicting span in the response.
- Resolution is user-visible and per conflict: keep this device's entry, keep
  the remote entry, or trim to the non-overlapping part. Nothing is resolved by
  silently overwriting, and no automatic merge invents time.
- Sessions themselves are single-owner: the first device to upload an active
  session wins; a second device's active session is a separate session and must
  be stopped before upload.

## 7. Restoring onto a replacement phone

- The supported restore path is the journal export/restore already implemented
  locally (`docs/mvp/journal-backup.md`), which needs no account: export on the
  old phone, restore on the new one.
- With an account, a fresh install offers "restore from backup": download the
  account's remote rows into an empty local journal in one transaction, then
  reconcile reminders from the restored rows (never from uploaded native ids).
- Restore never runs automatically over a non-empty journal; it requires an
  explicit replace/merge choice, exactly like the local file flow.
- Ownership after restore: the restored rows are bound to the signed-in account
  on that device.

## 8. Remote schema and Row Level Security (sketch, not applied)

```sql
create table public.sessions (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  started_at bigint not null,
  ended_at bigint,
  reminder_window_end_at bigint not null,
  interval_seconds integer not null,
  start_timezone text not null,
  status text not null,
  created_at bigint not null,
  updated_at bigint not null,
  revision integer not null default 1,
  client_action_id text
);
create table public.entries (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  start_at bigint not null,
  end_at bigint not null,
  kind text not null,
  description text,
  category text,
  origin text not null,
  client_action_id text,
  revision integer not null default 1,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  unique (owner_id, client_action_id)
);
alter table public.sessions enable row level security;
alter table public.entries enable row level security;
create policy "owner reads own sessions" on public.sessions for select using (auth.uid() = owner_id);
create policy "owner writes own sessions" on public.sessions for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner reads own entries" on public.entries for select using (auth.uid() = owner_id);
create policy "owner writes own entries" on public.entries for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
```

- The mobile app uses only the anon key plus the user's JWT. A service-role key
  must never ship in the app.
- Isolation tests to write once access exists: user A cannot select, insert,
  update or delete user B's rows through the anon key with A's JWT; a signed-out
  client cannot read any rows; a forged `owner_id` in an insert is rejected by
  the `with check` clause.

## 9. First implementation slice (blocked)

The first safe slice is: optional sign-in/sign-out with a native session in
secure storage, local features unchanged while signed out, remote tables with
owner-based RLS, and **no automatic upload** of the existing journal.

Required to start it:

1. A Supabase project URL and anon key (Expo public env values).
2. Dashboard/CLI access to run migrations and read the RLS test results.
3. A decision on the email/OAuth providers to enable.

Without those, only the local half exists today (SQLite truth, offline
behavior, export/restore). No sign-in UI is shipped, because a button that
cannot authenticate would be a lie.
