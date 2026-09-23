# Back15 agent guide

This repository is the Expo/React Native implementation of Back15 V0.1, a personal, offline, 15-minute activity journal. The app is **implemented** on `mvp/v0.1-implementation` (PR #1): the pure time engine, versioned SQLite storage, transactional use cases, the offline Today/capture/Stop loop, History/day detail, edit/delete, Settings, and bounded local reminder scheduling with reconciliation all exist behind the contracts in the documents below. Never present mock entries or hardcoded example totals as real user data.

## Current status and outstanding gates

Software work is done and CI runs `pnpm run typecheck` plus `pnpm run test` (domain, storage, use-case, reminder-contract and journey tests). The Android release gate is **BLOCKED / PENDING**, not passed:

1. **Installed standalone APK** — not yet built or installed (no build host, Android SDK, EAS credentials, or target phone was available during implementation).
2. **Physical-device E2E** — the [device script](docs/mvp/e2e-spec.md#83-physical-device-e2e-script) has not run on the Samsung. Notification scheduling, delivery lateness, locked/terminated taps, reboot and permission changes are unverified.
3. **Multi-day observations** — two working days of reminder observations and the three-day personal trial are `PENDING OBSERVATION`.

Do not describe notification behavior as verified, and do not call V0.1 ready to ship, on the strength of typecheck, tests, CI, or a JS bundle export. Record gate status in [docs/mvp/evidence](docs/mvp/evidence/README.md) as `PASS`, `FAIL`, `BLOCKED`, or `PENDING OBSERVATION` with evidence.

## Read before changing code

1. [MVP E2E spec](docs/mvp/e2e-spec.md): what the app must do and how release is accepted. Its later schema additions (`client_action_id` and `revision`) are required.
2. [System design](docs/system-design.md): authoritative time model, persistence model, and reminder assumptions.
3. [MVP architecture guide](docs/mvp/architecture.md): where to put code, operation boundaries, and integration order. It elaborates on the two documents above.
4. [MVP design guide](docs/mvp/design.md) and its selected screenshot: intended visual direction and screen states. A mockup never overrides time or product rules.

For the concrete execution order, task checklist, dependencies and evidence gates, follow [the implementation waves](docs/mvp/implementation-waves.md). The wave plan does not override the source documents above.

If documents appear to disagree, use the E2E spec for behavior and acceptance, the system design for domain/data decisions, this guide for implementation conventions, and the design guide for visual treatment. Fix the conflict in documentation when touching the relevant area. Do not silently implement the screenshot's example labels as business rules.

## Stack and working commands

- Expo SDK 57, React Native, Expo Router, TypeScript strict mode, `expo-sqlite`, and `expo-notifications`.
- **pnpm only**, pinned in `package.json`; commit `pnpm-lock.yaml`. Do not add `package-lock.json` or use npm install for project dependencies.
- Set up: `pnpm install --frozen-lockfile`.
- Validate code: `pnpm run typecheck` and `pnpm run test` (Vitest; domain, storage, use-case, reminder-contract and journey tests).
- Start: `pnpm start`. Verify native notification behavior on an installed development build and real phone; Expo Go is insufficient as the notification release gate.
- On the ARM64 development VM, `pnpm exec expo export --platform android --no-bytecode` can check JS bundling. It does **not** verify Hermes or make a shippable Android build. Use a supported build host for release bundling.

## Implementation rules

- Keep time calculations in pure `src/domain/` TypeScript; no React, Expo, SQLite, or notification imports there. Use `[start_at, end_at)` UTC millisecond ranges and session-start-anchored 900-second boundaries. Do not round stored activity times to 15-minute slots.
- Keep routes under `app/` thin. Put orchestration in `src/use-cases/`, SQLite migrations/queries in `src/storage/`, OS permission/scheduling in `src/reminders/`, and reusable UI under `src/features/` or `src/components/`.
- SQLite is the source of truth for sessions and entries. Alerts remind; they do not create records. Unresolved time is computed from uncovered session ranges; skipped time is an explicit stored entry.
- Permit only one active session. Keep every live entry inside its session without overlap. Mutations that check a range and write it run in one transaction. A create action uses a stable client action ID; edits and deletes check an integer revision. Deleted entries are tombstones and their former time becomes unresolved.
- Commit Start/Stop and entry writes before reconciling native reminders. A scheduling failure must never discard a valid time entry or session. Recover from process death, denied permission, duplicate/stale notification taps, and the 12-hour reminder cutoff on app open.
- Notifications are local, generic, and bounded to the active session's 12-hour window. Do not depend on a background JS interval or claim that the OS delivers at exact minute boundaries.
- No account, API, Supabase, analytics SDK, push service, web client, AI scoring, or synchronization in V0.1. Avoid new dependencies or project structure until the slice needs them.

## Work in reviewable slices

1. Prove local notification scheduling/cancellation on the real target Android device; record planned and actual delivery times.
2. Build pure domain time operations and meaningful deterministic tests for boundaries, gaps, overlap, cutoff, midnight/DST, and time-balance identity.
3. Add versioned SQLite schema, repositories, safe migrations, transactional/idempotent use cases and targeted integration tests.
4. Wire Today, capture/Continue/Skip, Stop, and honest totals. Implement History/edit and missed-time recovery through the same domain/use cases.
5. Add reminder reconciliation, permission states and cold-start navigation; run the physical-device E2E script and three-day personal trial from the spec.

Keep each slice functional and state exactly which gates were actually tested. A typecheck or web preview alone does not prove notification delivery. Do not add tests that merely mirror UI markup; test the time and storage failure modes that could corrupt a day.

## Design and handoff

- Use [the selected Today reference](docs/mvp/assets/today-home-reference.png) and the [design guide](docs/mvp/design.md) for the visual language. Recreate it with accessible native components, not a screenshot used as the screen.
- Preserve idle, active, permission-denied, unresolved, skipped, edited, expired, empty and error states. Render real derived values; never freeze the mockup's example date, counts, or labels in production.
- Update relevant docs when changing a domain contract, data schema, notification strategy, navigation, or design system. Report code changed, checks performed and any real-device checks still outstanding.
