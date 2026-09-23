# Back15 V0.1 evidence

Evidence for the implementation waves in [implementation-waves.md](../implementation-waves.md).
A gate is only `PASS` with the recorded observation below; `BLOCKED` and
`PENDING OBSERVATION` are not green.

| Gate | Status | Where |
| --- | --- | --- |
| W0 installed build + reminder risk probe on the Samsung | **BLOCKED** (no device, Android SDK, or EAS credentials in this environment) | [w0-device-probe.md](w0-device-probe.md) |
| W1 domain time engine tests | **PASS** (135 assertions across 6 domain files) | `pnpm run test` |
| W2 storage/use-case integration tests | **PASS** | `pnpm run test` |
| W3–W5 offline Today / capture / stop / history / edit / settings | Implemented; typecheck and Android JS bundle pass. Runtime UI not exercised on a device → device part **BLOCKED** | [w6-verification.md](w6-verification.md) |
| W6 automated gates + CI | Typecheck + 125 tests pass locally; CI updated | [w6-verification.md](w6-verification.md) |
| W6 installable standalone APK on the phone | **BLOCKED** | [w6-verification.md](w6-verification.md) |
| W6 physical-device E2E script | **BLOCKED** | [w6-verification.md](w6-verification.md) |
| W7 two working days of reminder observations + three-day trial | **PENDING OBSERVATION** | [w7-observations.md](w7-observations.md) |

Candidate: branch `mvp/v0.1-implementation`, commits `251bebf` (W1),
`bf1477d` (W2), `7dddac5` (W3–W5), plus the verification commit.

## Reproducing the software gates

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
pnpm exec expo export --platform android --no-bytecode   # JS bundle diagnostic only
```

The `--no-bytecode` export on this ARM64 host checks that the app bundles; it
does **not** prove Hermes, native scheduling, or a shippable APK.
