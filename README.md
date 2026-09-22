# Back15

**What did you do with the last 15 minutes?**

Back15 is a local-first mobile time tracker. The planned V0.1 prompts during an active session, records the user's answers, preserves missed time as unresolved, and shows an honest daily timeline.

## Project status

This repository currently contains the **Expo app foundation**, three navigable starter screens, and the product/system specifications. Tracking, SQLite persistence, notification scheduling, and editing are **not implemented yet**. The Today screen does not pretend to have recorded time.

## Start locally

Requirements: Node.js compatible with the Expo SDK in `package.json`, npm, and the Expo Go app on a phone or an Android emulator.

```bash
npm ci
npm run typecheck
npm start
```

Scan the displayed QR code with Expo Go. `npm run android` and `npm run ios` launch the corresponding platform when the local development environment supports it. For native notification behavior, test an installed development build on a physical phone; Expo Go alone is not the V0.1 acceptance gate.

## Layout

```text
app/                         Expo Router screens and navigation
src/theme/                   Shared visual tokens
docs/system-design.md        Architecture, time model, notification strategy
docs/e2e-spec.md             MVP behavior, data contract, and acceptance tests
```

As implementation proceeds, add pure time logic under `src/domain`, use cases under `src/use-cases`, SQLite adapters under `src/storage`, and notification adapters under `src/reminders`. See the docs before adding behavior.

## Initial implementation order

1. Test bounded local notifications on a physical Android phone.
2. Implement the time model and SQLite schema.
3. Wire Start/Stop and the logging flow into Today.
4. Add notification reconciliation, missed-time recovery, edits, and History.
5. Validate the complete E2E workflow on real devices.

No account or backend is required for V0.1. The current launcher/icon images came from the Expo starter template and should be replaced before a public release.
