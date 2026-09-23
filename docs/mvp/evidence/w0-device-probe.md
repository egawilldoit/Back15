# W0 — device baseline and reminder risk probe

**Status: BLOCKED (environment), software side complete.**

## Baseline recorded 2026-09-23

| Item | Value |
| --- | --- |
| Starting `main` SHA | `83915d85a65edfbd98de151ec886827cc1f14fd1` |
| Working tree | clean before the branch was created |
| Branch | `mvp/v0.1-implementation` |
| Node | v24.18.0 |
| pnpm | 11.19.0 (`packageManager: pnpm@11.19.0`) |
| Expo / React Native | Expo `~57.0.24`, React Native `0.86.3` |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm run typecheck` | PASS (baseline and after every wave) |
| GitHub CI | updated to run `pnpm run test`; see [w6-verification.md](w6-verification.md) |

## Why the device gate is blocked

The probe requires an installed development/release-like build on the target
Samsung and a supported Android build host. In this environment:

- `adb devices` reports no attached device; agent device access is turned off.
- No Android SDK, `sdkmanager`, or EAS CLI is installed; no Expo account token
  is present (`~/.expo/state.json` contains only an anonymous uuid and no
  `EXPO_TOKEN` is set), so an EAS internal/preview build cannot be triggered.
- This host is ARM64 Linux; per `AGENTS.md`, `expo export --platform android
  --no-bytecode` checks JS bundling only and is not a release build route.

No phone observations are claimed. The probe procedure below is ready to run
the moment a build host and the Samsung are available.

## What was verified instead

- W0.2 configuration: `app.json` already defines `com.egawilldoit.back15`, the
  `back15` scheme, and the `expo-notifications` / `expo-sqlite` plugins. No
  Android permission was added beyond what the plugins provide; no exact-alarm
  permission was requested.
- W0.3 diagnostic path: an isolated **Notification test** screen
  (`app/diagnostic.tsx`, reachable from Settings → Reminders and from the
  Today reminder banner) schedules immediate/10s/1min/15min local
  notifications, lists pending request IDs with intended `due_at`, and records
  every received/tapped event with its observed lateness. Its payloads are
  marked `diagnostic` so the reminder reconciler ignores them; it writes no
  sessions or entries.
- W0.4 alarm capability: `app.json` declares `SCHEDULE_EXACT_ALARM`, so Android
  12+ can use exact alarms when the OS grants it. When it is not granted,
  `expo-notifications` falls back to `setAndAllowWhileIdle`, which batches
  delivery (see `ExpoSchedulingDelegate.setupAlarm`). Lateness is expected and
  must be measured, never assumed.
- W0.4 strategy: the adapter (`src/reminders/expoReminders.ts`) implements the
  finite one-shot `DATE` schedule bounded to the session's 12-hour window
  (≤48 requests), with payloads `{version, sessionId, dueAt}` and no private
  text. Integration tests cover cancel/duplicate/orphan/crash-ordering
  behaviour against a fake OS scheduler.

## Probe procedure to run on a device (not yet performed)

1. Install the candidate build; run without internet.
2. Open Settings → **Notification test**; confirm permission and channel, then use
   **Send now** and **In 10 seconds** to confirm the local path.
3. Schedule in 1 minute; record `due_at` and the native request ID shown.
4. Lock the phone; record the observed presentation time and lateness.
5. Tap the alert from locked and from terminated state; confirm the app opens
   the current capture target (not the payload's stale time).
6. Repeat with the app backgrounded and after a reboot.
7. Schedule several requests, then **Cancel test notifications**; confirm the
   pending list is empty and that nothing arrives.
8. Record for the report: candidate SHA, build type, app version, device model,
   Android version, permission/channel, battery setting, `session_id`,
   `due_at` UTC, request ID, `presented_at`, `tapped_at`, `saved_at`, and the
   outcome (`delivered`, `late`, `missing`, `blocked`). A missing alert is not
   zero lateness.
