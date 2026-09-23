# Back15

**What did you do with the last 15 minutes?**

Back15 is a local-first mobile time tracker. During an active session it reminds
the user at session-anchored 15-minute boundaries, records their answers as real
`[start, end)` spans, keeps missed time as computed unresolved time, and shows an
honest daily timeline that can be corrected afterwards.

## Project status

V0.1 software is implemented on branch `mvp/v0.1-implementation`:

- pure domain time engine, SQLite v1 schema with migrations, transactional and
  idempotent use cases, derived read models;
- offline Today loop (Start, Log Now, capture, Continue previous, Skip, Stop),
  History with day detail, entry edit/delete, Settings;
- local notification scheduling bounded to the active session's 12-hour window,
  with reconciliation and cold-start tap handling;
- 132 deterministic tests over the time, storage, use-case and reminder
  contract layers.

**Still outstanding, and not claimed:** the installed APK and the physical-device
probes (Samsung) plus two working days of reminder observations and a three-day
personal trial. See [the evidence index](docs/mvp/evidence/README.md) for the
exact gates, what was tested, and what is blocked.

## Start locally

Requirements: Node.js 24, pnpm 11.19.0, and an Android device or emulator with a
development build for native notification behavior (Expo Go is not the release
gate).

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
pnpm start
```

`pnpm run test` runs the deterministic domain/storage/use-case/adapter tests
with Vitest. `pnpm android` and `pnpm ios` launch the corresponding platform
when the local development environment supports it.

## Layout

```text
app/                         Expo Router screens and modal routes (thin)
src/domain/                  Pure time rules, session/entry types, totals
src/use-cases/               Start/Stop, create/continue/skip, edit, read models, reconcile
src/storage/                 Versioned migrations, SQL port, repositories, Expo SQLite adapter
src/reminders/               ReminderPort contract and the Expo notifications adapter
src/features/                Today, capture, stop, edit, history and settings UI
src/components/, src/theme/  Reusable native components and design tokens
docs/system-design.md        Time/data model and notification strategy
docs/mvp/                    Spec, architecture, design guide, waves and evidence
AGENTS.md                    Agent instructions for MVP delivery
```

## Verification

- [Evidence index](docs/mvp/evidence/README.md) — gate status and reproduction
  commands.
- [W0 device probe](docs/mvp/evidence/w0-device-probe.md) — blocked; includes
  the ready-to-run probe procedure.
- [W6 verification](docs/mvp/evidence/w6-verification.md) — automated results,
  APK and physical-device E2E status.
- [W7 observations](docs/mvp/evidence/w7-observations.md) — pending real-day
  tables.

No account or backend is required for V0.1. The launcher/icon images still come
from the Expo starter template and should be replaced before a public release.
