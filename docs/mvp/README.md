# Back15 MVP documents

- [End-to-end specification](e2e-spec.md): release behavior, time rules and acceptance cases.
- [Architecture guide](architecture.md): implementation boundaries, storage, reminder recovery and gates.
- [Design guide](design.md): selected visual direction and native screen-state requirements.
- [Selected Today reference](assets/today-home-reference.png): visual concept, not a functioning or numerically authoritative screen.
- [Implementation waves](implementation-waves.md): full MVP delivery order, tasks, blockers, rules and verification gates.
- [Evidence](evidence/README.md): gate status, reproduction commands, and the W7 observation tables.
- [System design](../system-design.md): authoritative time/data model and bounded notification strategy.
- [Agent guide](../../AGENTS.md): repo conventions and work sequence.

**Implementation status:** V0.1 software is implemented on
`mvp/v0.1-implementation` (domain engine, SQLite schema, offline Today/capture/
Stop, history/edit/settings, bounded local reminders). The installed-APK gate,
the physical-device E2E run, and the elapsed W7 observations are not green: see
[the evidence index](evidence/README.md).
