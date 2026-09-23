# W7 — release observations after the implementation night

**Status: PENDING OBSERVATION.** These gates require elapsed real days. They
must not be reported as passed until the tables below are filled in on the
target phone.

## A. Two full working days of reminder observations

Use the Reminder diagnostic only to confirm the adapter; the release claim comes
from real sessions. For every planned check-in log:

| Date | Session start | Planned due (UTC/local) | Alert observed | Lateness | State (locked/background/terminated) | Tapped? | Capture range saved | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |

Outcome values: `delivered`, `late`, `missing`, `blocked` (force-stopped, battery
restriction, permission off). A missing alert is not zero lateness. If reminders
repeatedly fail under normal settings, V0.1 is blocked until the adapter changes
and the probe is repeated.

## B. Three working days of personal use

| Day | Sessions started | Check-ins answered | Continued (no typing) | Ignored gaps consolidated | Capture time (seconds) | Unwanted interruptions | Missed gaps remaining | Notes on 15-minute cadence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |

Record friction points and whether 15 minutes should remain the default.

## C. Device/environment record

| Item | Value |
| --- | --- |
| Candidate SHA | |
| Build type / link | |
| Device model | |
| Android version | |
| Notification permission + channel | |
| Battery setting | |
| App version | |

## D. Verdict rules

- V0.1 is complete only when A shows tolerable delivery and B records three
  real days upholding the arithmetic invariant.
- iOS remains outside the release claim until the same locked, terminated,
  permission-denied, missed-gap, cutoff and Stop checks pass on a physical
  iPhone.
