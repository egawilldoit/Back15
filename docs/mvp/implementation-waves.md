# Back15 V0.1 — end-to-end implementation waves

**Status:** Execution plan; no feature is considered implemented because it appears here.

**Target:** One offline Android app, installed on the user's Samsung, implementing the entire [MVP E2E contract](e2e-spec.md).

**Planning date:** 2026-09-22.
**Source of truth:** [E2E behavior and release criteria](e2e-spec.md) → [time and storage model](../system-design.md) → [agent conventions](../../AGENTS.md) → [architecture guide](architecture.md) → [design guide](design.md). This document orders delivery; it does not redefine those contracts.

## 1. Definition of success

The installed app can complete this real-device journey with the network off:

1. Start a session; keep working with the screen locked.
2. Receive and tap a local reminder; save an activity.
3. At the next check-in, Continue previous without typing.
4. Ignore multiple reminders; reopen and fill **one** eligible contiguous completed gap.
5. Log Now inside an unfinished interval; explicitly Skip another interval.
6. Edit and delete entries; see time move between recorded, skipped and unresolved without overlap.
7. Stop; receive no *intended* future prompts from that session.
8. Force-close and reopen; read Today and previous-day history without lost data.

**Arithmetic invariant:** for every session/day slice, `elapsed = recorded + skipped + unresolved`, computed in milliseconds before displayed-minute rounding. No reminder, countdown, category, screenshot or placeholder gap is a source of truth.

### What “tonight” can and cannot prove

The implementation, automated checks, installable Android build and a short real-phone end-to-end run are the immediate target. The specification additionally requires **two full working days of reminder observations** and a **three-day personal-use trial**. Those gates require elapsed days: record them as `PENDING OBSERVATION` until actually completed, even if every code task finishes tonight. iOS is outside the Android-first release claim until its own physical-device gate passes.

Do not reduce the feature list to meet a date. If the native notification strategy fails on the target phone, the complete MVP is blocked until a tested adapter or explicitly revised product promise exists.

## 2. Rules for every implementation slice

- **One authority for time:** store UTC epoch milliseconds and `[start_at, end_at)` ranges. Each session snapshots `interval_seconds=900`; due boundaries remain anchored to its start. Never round persisted spans to 15-minute slots.
- **One active session:** enforce in SQLite, not only by disabling a button. A repeated Start returns the existing active session.
- **Account for all session time:** logged entries carry a description; skipped entries are explicit; unresolved ranges are derived from uncovered session time and never persisted as invented rows. Deleted entries are tombstones and their time becomes unresolved.
- **Protect writes:** keep overlap checks and mutation in one SQLite exclusive transaction; use stable `client_action_id` for creation retries and integer `revision` for edits/deletes. Store an entry wholly inside its session and do not permit live overlap.
- **Database first, native effects second:** commit Start, Stop and entry mutations before requesting/cancelling OS reminders. A native API failure never deletes or fabricates time. Reconcile again on app open/resume.
- **No background JS clock:** a foreground countdown may update the display but may neither define due boundaries nor create entries. OS delivery is approximate; show “next planned check-in,” not a guaranteed arrival.
- **Respect the product boundary:** no account, backend, Supabase, analytics SDK, push service, sync, AI, project system, or web app. JSON/CSV export is the first *post-MVP* follow-up because local data can be lost with device loss/uninstall.
- **Implement the selected visual language:** use the [approved Today image](assets/today-home-reference.png) and [design guide](design.md) as art direction, with accessible native components and real data. The screenshot's `15m open` is not an all-unresolved total at 10:21; full unresolved is 18m in that example.
- **Keep changes reviewable:** finish and validate one vertical behavior at a time; commit only runnable states. For each handoff, record files touched, domain changes, checks and results, physical-device evidence, and gates still pending. Do not report green based solely on typecheck or an Expo Go preview.
- **Use pnpm only:** `package.json` pins `pnpm@11.19.0`. Commit `pnpm-lock.yaml`; do not add `package-lock.json`. Add a test runner only when implementing meaningful domain/storage/adapter tests.

### Safe parallel work and dependencies

Work by dependency, not by screen ownership. A notification probe and pure domain work can proceed independently, but SQLite write contracts must use the agreed domain types. Do not implement a second totals formula in UI or a second scheduler in screen components. Integration of native reminders waits for real-device probe results; screen wiring waits for stable use-case outputs. One person/agent integrates and checks each wave before dependent work starts.

## 3. Wave map

| Wave | Deliverable | Blocked by | Evidence / exit gate |
| --- | --- | --- | --- |
| W0 | Reproducible installed Android build and reminder risk probe | None | Real Samsung receives/taps/cancels a local prompt; planned vs observed times logged. |
| W1 | Pure time engine and cases | None | Boundary, gap, overlap, cutoff, day clipping and balance tests pass. |
| W2 | SQLite migrations and transactional use cases | W1 | Durable one-active state, idempotent writes, conflict handling, reopen test. |
| W3 | Today + capture + Stop in selected style | W2 | Full manual offline loop works without reminders. |
| W4 | Native scheduling, permission and reconciliation | W0, W2, W3 | Actual alert opens correct gap; stale/cancel/denial/cold start work. |
| W5 | History, edit and Settings | W2, W3 | Corrections and multi-day totals work without gaps vanishing. |
| W6 | End-to-end hardening and Android installable build | W4, W5 | Full device script, tests, CI, recorded build SHA and residual gates. |
| W7 | Elapsed-time release observations | W6 | Two working days of alert observations + three-day personal trial. |

W7 starts after the overnight implementation; it cannot be replaced with accelerated or mocked time.

## 4. W0 — Device/build baseline and reminder risk probe

**User-visible outcome:** Back15 runs as its own Android app on the actual phone and a local check-in can appear with the screen locked.

- [ ] W0.1 Record the starting `main` SHA, Node/pnpm versions, target Samsung model and Android version. Run `pnpm install --frozen-lockfile`, `pnpm run typecheck`, and existing CI. Keep the branch clean before work.
- [ ] W0.2 Confirm Expo app ID/config, Android notification channel, permission prompt and a reproducible **installable Android development build**. Choose a supported native build host or EAS build; an ARM64 Linux `expo export --no-bytecode` checks JS bundling only, not Hermes/native delivery.
- [ ] W0.3 Create a small local-notification diagnostic path, removed or isolated before handoff. On the phone, schedule near-term prompts; record intended due, arrival, tap-to-open, pending IDs and cancellation after Stop. Observe locked/background/terminated behavior and reboot if practical.
- [ ] W0.4 Probe whether the proposed finite, one-shot `48 × 15-minute` schedule is accepted on the installed device; inspect `getAllScheduledNotificationsAsync()` and test cancellation. It is a **candidate**, not proof that 48 reminders actually arrive.
- [ ] W0.5 Decide the reminder adapter contract (`schedule`, `list`, `cancel`, permission). If requests fail or delivery is unusable under normal settings, record evidence and adapt the strategy; never silently substitute an unbounded repeating notification.

**Exit:** an installed build receives, opens and cancels at least one local check-in with observed timestamps. Document platform restrictions and any deviation from the proposed scheduler. No exact-alarm permission is added by default merely to make a unit test green: Android limits exact alarms and discourages them when an inexact alarm is suitable.

**References:** [Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Android alarms](https://developer.android.com/develop/background-work/services/alarms).

## 5. W1 — Pure domain and time model

**User-visible outcome:** every screen and action will agree on what interval is due and what time is missing.

- [ ] W1.1 Define typed `Session`, `Entry`, statuses, immutable UTC instants, `[start, end)` range helpers and result/error types; no React/Expo/SQLite imports under `src/domain/`.
- [ ] W1.2 Implement anchored due boundaries, latest completed boundary, current partial interval, `effective_end = min(now, cutoff)` for active sessions and closed `ended_at` for stopped sessions. A Save never shifts the due series.
- [ ] W1.3 Implement interval clipping, union/subtraction, contiguous uncovered components and nonoverlap validation; treat skipped as covered but distinct from logged.
- [ ] W1.4 Implement target selection: newest contiguous *completed* unresolved span for check-in, separate current partial for Log Now, older-gap navigation without crossing an existing live entry. Leave a gap unresolved on Close.
- [ ] W1.5 Derive session/day totals and category partitions; clip at actual local midnights using the current display time zone, preserving stored UTC instants and handling DST.
- [ ] W1.6 Test starting at `09:03:20`, due at `09:18:20`; `10:00–10:45` missed at `10:50`; Log Now at `10:22`; adjacent vs overlapping entries; continue/copy semantics; skip/delete math; two sessions with off-session time; midnight/DST; 12-hour cap; backward clock anomaly. Assert exact milliseconds before UI rounding.

**Exit:** domain tests demonstrate nonoverlap and `elapsed = recorded + skipped + unresolved` across the supplied cases. No production use case depends on a JS timer remaining alive in the background.

## 6. W2 — SQLite schema, operations and restart safety

**User-visible outcome:** rapid taps, app restarts and failed native notifications cannot corrupt the journal.

- [ ] W2.1 Add a versioned, non-destructive SQLite migration using `PRAGMA user_version`; foreign keys, session/time indexes and a partial unique index permitting only one active session. Never erase existing data on migration failure.
- [ ] W2.2 Implement `tracking_sessions`, `entries`, `reminder_requests` metadata and `app_settings` from the [system design](../system-design.md#4-sqlite-schema), including the E2E additions: nullable unique `client_action_id` for existing-row migration, required on new create actions, and `revision INTEGER NOT NULL DEFAULT 1`.
- [ ] W2.3 Implement repositories and `startSession`, `stopSession`, `createEntry`, `continuePrevious`, `skipRange`, `updateEntry`, `deleteEntry`, `getToday`/day detail. Use-case boundaries own orchestration; routes never execute SQL.
- [ ] W2.4 Use `withExclusiveTransactionAsync` for read/validate/write. Check observed revision, in-session range, nonoverlap, idempotency key and state before commit. Retried Save with the *same* key returns the same row; independent conflicting actions receive a meaningful error.
- [ ] W2.5 Model deletion as a tombstone, hide deleted descriptions from normal UI/export and recompute uncovered time. Do not persist gap rows or cached day totals.
- [ ] W2.6 Test migration/rollback, duplicate Start, duplicate Save, two conflicting Save attempts, stale edit/delete, overlapping edits, Skip, cutoff, historical backfill, process restart and failure after database commit. Keep a fixture with several months of entries for day-query performance.

**Exit:** stored data survives force-close/reopen; no duplicate active session or overlapping live entries; failed native scheduling does not affect committed time. Expo documents that `withTransactionAsync` can include intervening asynchronous queries; the exclusive transaction API is the intended boundary for these writes.

**Reference:** [Expo SQLite transactions](https://docs.expo.dev/versions/latest/sdk/sqlite/).

## 7. W3 — Complete manual Today workflow and visual system

**User-visible outcome:** the entire Start → write/continue/skip → review → Stop flow works offline, even when notifications are denied.

- [ ] W3.1 Centralize warm background, ink, cobalt, orange, separators, typography and spacing in `src/theme/`. Build a native Today layout inspired by the selected image rather than rendering the PNG as UI.
- [ ] W3.2 Idle: date, previous sessions' honest daily totals, empty state and Start. Active: start timestamp, current `[start, end)` interval, next **planned** time, foreground countdown, Log Now, Stop, time ledger and timeline. Show the 12-hour reminder horizon as specified.
- [ ] W3.3 One capture sheet handles an exact proposed range, description (trim, limit 500 Unicode characters), optional category, one-tap Continue previous, Save, Skip and Close. Support a partial Log Now span and an editable proposed range that goes through the same overlap rules.
- [ ] W3.4 A missed-time card offers one completed contiguous range and indicates older separate gaps. A notification ignored at 10:45 and opened at 10:50 must not silently record 10:45–10:50.
- [ ] W3.5 Stop confirmation states the proposed end and unresolved final partial span. Stop works even if the user declines to describe that span. After Stop, show the day summary and make later correction available.
- [ ] W3.6 Render real idle/active/denied/empty/unresolved/skipped/expired/storage-error states. Keep draft text on failed Save; avoid duplicate sheet navigation; check touch targets, accessibility labels, contrast, large text, short screens and keyboard/safe areas.

**Exit:** with airplane mode on and permission denied, a user can start, Log Now, Continue, Skip, resolve a missed completed gap, Stop, reopen and see unchanged data. The screenshot's example counters and text are not hardcoded.

## 8. W4 — Reminders, cold start and reconciliation

**User-visible outcome:** a check-in opens the correct current missing time after lock/termination, and Stop ends intended prompts.

- [ ] W4.1 Configure Android channel *before* the relevant permission flow. Explain the request on first Start; denial still starts tracking and leaves manual capture available. Settings can open device permission settings.
- [ ] W4.2 Implement the **bounded strategy proven in W0**. Initially propose one local scheduled notification per remaining boundary through 12 hours (at most 48 for a new session). Payload: version, session ID and intended due timestamp; no activity text or category.
- [ ] W4.3 Reconcile on initial app load, foreground/resume, Start/Stop, and permission/reminder-preference change. Load SQLite first; close an expired session at the cutoff; compare future eligible boundaries against pending native requests; remove duplicate/orphan/expired requests and schedule missing ones. OS request IDs are disposable metadata.
- [ ] W4.4 Account for a crash between an OS schedule call and storing its request ID: inspect OS pending payloads before creating another request. After Stop commits, attempt cancellation/dismissal; retry cleanup next launch if native cancellation fails.
- [ ] W4.5 On any notification tap, load DB and derive the target again; never trust a stale payload to make a write. An alert for a stopped session opens only historical unresolved time when applicable, never a new active session.
- [ ] W4.6 Show reminder disabled/unavailable/cutoff states truthfully; accept clock anomaly review instead of manufacturing elapsed time. Cover locked, terminated, multiple ignored alerts, permission revoked, reboot/reopen and stopped-session taps in tests plus phone checks.

**Exit:** at least one real alert leads to an accurate capture range; ignored alerts consolidate; no intentional future requests belong to a stopped session. Unit tests with a fake native adapter cover failures, duplicates and crash ordering. Record lateness and delivery failures instead of promising exact arrival.

## 9. W5 — History, corrections and Settings

**User-visible outcome:** a person can inspect previous days and fix inaccurate records without losing time.

- [ ] W5.1 History lists tracked local days with elapsed, recorded, skipped and unresolved totals. Day detail shares the Today timeline; omit empty days and handle multiple sessions and midnight-crossing sessions correctly.
- [ ] W5.2 Edit sheet updates description, optional category and real start/end bounds; validates in-session/nonoverlap and revision. A skipped span can become logged. Stale revisions show a conflict instead of overwriting a later edit.
- [ ] W5.3 Delete requires confirmation and tombstones the row. Recorded decreases, unresolved increases by its former covered duration; unchanged session elapsed remains visible.
- [ ] W5.4 Settings shows permission and preference, a fixed 15-minute interval and maximum 12-hour reminder window. Disabling reminders cancels pending requests without ending tracking; enabling adds only future eligible ones. Sound/vibration toggles and editable interval duration remain post-MVP.
- [ ] W5.5 Exercise empty History, a day with no gaps, separated gaps, skipped entries, multiple sessions, midnight/DST, large fonts and offline navigation.

**Exit:** all corrections persist after restart and uphold the arithmetic invariant. No time between sessions is counted as session time.

## 10. W6 — Build, end-to-end verification and evidence

**User-visible outcome:** an installable Android V0.1 candidate with a documented end-to-end result.

- [ ] W6.1 Run `pnpm install --frozen-lockfile`, `pnpm run typecheck`, targeted domain/storage/reminder tests and GitHub CI on the exact candidate SHA. Keep `pnpm-lock.yaml` the only lockfile. Treat a JS-only `expo export --no-bytecode` on the ARM VM as a diagnostic, not a release gate.
- [ ] W6.2 Produce an **APK** from an appropriate native build route and install it on the Samsung. A default AAB cannot be installed directly on a device; use an APK-capable internal/distribution profile if using EAS.
- [ ] W6.3 Run the full [physical-device acceptance script](e2e-spec.md#83-physical-device-e2e-script) with network off: Start, locked-screen reminder, Save, Continue, ignored reminders and single gap, Log Now, Skip, Edit, Delete, Stop, stale alert, restart/reboot and permission denial/re-enable.
- [ ] W6.4 Record exact candidate SHA/build link, phone model/OS, app version, notification permission and battery settings, planned due times, observed arrivals, missing/late requests, UI friction and screenshots of idle/active/gap states. Check `elapsed = recorded + skipped + unresolved` after every mutation.
- [ ] W6.5 Verify no mock text masquerades as saved data, app icon/splash are intentional for the internal build, accessibility focus and keyboard behavior hold, storage errors are visible, and navigation never bypasses an invariant.
- [ ] W6.6 Update docs if implementation changes a contract; write a handoff with passed/failed/blocking checks and links to evidence. Do not mark the full release complete while W7 is pending.

**Exit:** the exact SHA passes automated gates and the offline installed-phone E2E run; known failures are fixed and rerun or explicitly block the candidate.

**Reference:** [Expo installable Android APK guidance](https://docs.expo.dev/build-reference/apk/).

## 11. W7 — Release observations after implementation night

- [ ] Observe and log planned vs actual reminder deliveries over **two full working days** in ordinary phone conditions, including lock, typical battery settings and normal app use. If reminders repeatedly fail, block V0.1 until a tested fix or revised product promise.
- [ ] Use Back15 for **three real working days** and record capture speed, unwanted interruptions, missed gaps, whether Continue meaningfully reduces friction and whether 15 minutes remains tolerable.
- [ ] Only then call the Android MVP ready. Do not claim iOS support until equivalent real-iPhone permission, lock, termination, missed-time, Stop and cutoff checks pass.

## 12. Agent handoff template

Use this at the end of each wave so the next person can resume without reconstructing work:

```text
Wave / task IDs:
Candidate commit SHA and branch:
Working feature demonstrated:
Files / schema / contract changed:
Tests and exact commands, with results:
Physical device, OS, build and observed behavior (or NOT TESTED):
Failed cases and reproduction:
Open blockers and next dependency:
Spec/design changes reflected in docs:
```

## 13. External facts checked for this plan

These are implementation inputs, not proof that the app has passed a device test:

- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) documents local schedule/list/cancel APIs and Android channels; local notifications can be prototyped in Expo Go, while the release gate here is an **installed app on a real phone**. Android may delay/suppress delivery.
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) distinguishes `withExclusiveTransactionAsync` from a nonexclusive async transaction that can be interrupted by other queries. Check the installed SDK while implementing.
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) and [Android APK builds](https://docs.expo.dev/build-reference/apk/) describe device installation; a JavaScript bundle is not a native binary.
- [Android alarm guidance](https://developer.android.com/develop/background-work/services/alarms) recommends inexact scheduling when appropriate and documents exact-alarm permission limits; the product must measure actual delivery instead of assuming an exact 15-minute alert.
