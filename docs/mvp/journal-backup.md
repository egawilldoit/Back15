# Journal backup format and restore rules

## Format

Settings → **Backup & restore** writes a JSON file named
`back15-journal-YYYY-MM-DD.json`:

```json
{
  "format": "back15-journal",
  "exportVersion": 1,
  "schemaVersion": 1,
  "createdAt": 1790123456789,
  "timeZone": "Europe/Berlin",
  "appVersion": "0.1.0",
  "settings": { "remindersEnabled": true },
  "sessions": [ ... ],
  "entries": [ ... ]
}
```

- Timestamps are exact UTC milliseconds. Ranges keep their real
  `[start_at, end_at)` bounds; nothing is rounded.
- Entries keep `kind` (`logged`/`skipped`), `category`, `origin`,
  `clientActionId`, `revision`, and `deletedAt` tombstones.
- Sessions keep their own `startTimezone`, interval and reminder window.
- **Not exported:** OS reminder request IDs (`reminder_requests`), the
  `last_observed_wall_at` clock observation, and the permission-explainer flag.
  Backups never contain tokens or account material.

No setting is required to interpret a journal: every session stores its start
time zone. `settings.remindersEnabled` is a device preference; a **replace**
restore writes it back, a **merge** keeps the phone's current value.

## Restore rules

- Validation happens before any write: format and versions, unique ids,
  session references, ranges inside session bounds, no overlapping live entries
  inside a session, one active session at most, and unique client action ids.
  Failures name the offending row.
- **Merge** upserts rows by id, so importing the same file twice is idempotent.
  It refuses to run when the file contains an active session and the phone is
  already tracking a different one, or when a client action id belongs to a
  different entry.
- **Replace** clears sessions, entries and reminder metadata first, then inserts
  the file.
- Both modes run in one exclusive SQLite transaction. A malformed file, an
  overlap, a conflict or a storage failure leaves the journal exactly as it was.
- Reminders are never imported: after a successful restore the app reconciles
  them from the restored rows, so no native request id can survive a restore.

## Limitations

- This feature cannot retroactively export data from an already installed
  Back15 build: the running APK must contain this screen. Only backups created
  after installing a build with it can be restored. The data on a phone whose
  APK predates this feature has **not** been backed up.
- A backup is plain JSON: it is readable by anyone who gets the file. Keep it
  somewhere you trust.
- Restoring does not merge time across devices automatically; overlapping
  entries in different sessions are preserved as-is, and the journal's overlap
  rule is enforced inside each session.
