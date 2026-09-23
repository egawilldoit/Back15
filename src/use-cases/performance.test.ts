import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { utc } from '../../tests/support/fixtures';
import { FakeReminderPort } from '../../tests/support/fakeReminders';
import { createCountingDatabase } from '../../tests/support/countingDatabase';
import type { CountingDatabase } from '../../tests/support/countingDatabase';
import { createTestDatabase } from '../../tests/support/nodeDatabase';
import type { TestDatabase } from '../../tests/support/nodeDatabase';
import { migrate } from '../storage/migrations';
import { createUseCaseDeps } from './deps';
import type { UseCaseDeps } from './deps';
import { getDayDetail, getHistory, getToday } from './readModels';
import { reconcile } from './reconcile';
import { startSession } from './sessions';

const DAYS = 120;
const ENTRIES_PER_DAY = 8;
const TODAY_ENTRIES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN = 60_000;

interface PerfHarness {
  raw: TestDatabase;
  db: CountingDatabase;
  deps: UseCaseDeps;
  now: number;
  setNow(value: number): void;
  close(): Promise<void>;
}

async function createPerfHarness(reminders: FakeReminderPort | null): Promise<PerfHarness> {
  const raw = createTestDatabase();
  const migrationStart = performance.now();
  await migrate(raw);
  const migrationMs = performance.now() - migrationStart;
  console.log(`[perf] migrate empty database: ${migrationMs.toFixed(1)}ms`);
  const db = createCountingDatabase(raw);
  let now = utc(2026, 9, 22, 10);
  let counter = 0;
  const deps = createUseCaseDeps({
    db,
    reminders,
    now: () => now,
    newId: () => {
      counter += 1;
      return `id-${counter}`;
    },
  });
  return {
    raw,
    db,
    deps,
    get now() {
      return now;
    },
    setNow: (value: number) => {
      now = value;
    },
    close: () => raw.closeAsync(),
  };
}

async function seedMonths(harness: PerfHarness) {
  const base = utc(2026, 5, 1, 9);
  for (let day = 0; day < DAYS; day += 1) {
    const startedAt = base + day * DAY_MS;
    const endedAt = startedAt + ENTRIES_PER_DAY * 15 * MIN;
    await harness.db.runAsync(
      `INSERT INTO tracking_sessions
         (id, started_at, ended_at, reminder_window_end_at, interval_seconds, start_timezone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 900, 'UTC', 'closed', ?, ?)`,
      [`s-${day}`, startedAt, endedAt, startedAt + 12 * 60 * MIN, startedAt, endedAt],
    );
    for (let index = 0; index < ENTRIES_PER_DAY; index += 1) {
      const startAt = startedAt + index * 15 * MIN;
      await harness.db.runAsync(
        `INSERT INTO entries
           (id, session_id, start_at, end_at, kind, description, category, origin, client_action_id, revision, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, 'logged', ?, 'work', 'typed', ?, 1, ?, ?, NULL)`,
        [
          `e-${day}-${index}`,
          `s-${day}`,
          startAt,
          startAt + 15 * MIN,
          `Task ${index}`,
          `action-${day}-${index}`,
          startAt,
          startAt,
        ],
      );
    }
  }
}

async function seedToday(harness: PerfHarness, sessionId: string) {
  const start = utc(2026, 9, 22, 9);
  for (let index = 0; index < TODAY_ENTRIES; index += 1) {
    const startAt = start + index * 15 * MIN;
    await harness.db.runAsync(
      `INSERT INTO entries
         (id, session_id, start_at, end_at, kind, description, category, origin, client_action_id, revision, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, 'logged', ?, 'work', 'typed', ?, 1, ?, ?, NULL)`,
      [
        `today-${index}`,
        sessionId,
        startAt,
        startAt + 15 * MIN,
        `Today task ${index}`,
        `today-action-${index}`,
        startAt,
        startAt,
      ],
    );
  }
}

describe('measured read models and reconciliation', () => {
  let harness: PerfHarness;
  let reminders: FakeReminderPort;

  beforeEach(async () => {
    reminders = new FakeReminderPort();
    harness = await createPerfHarness(reminders);
    await seedMonths(harness);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('reads Today, History and a day detail with bounded work', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    await seedToday(harness, started.value.session.id);
    harness.setNow(utc(2026, 9, 22, 16));

    harness.db.resetCounts();
    const todayStart = performance.now();
    const today = await getToday(harness.deps, { timezone: 'UTC' });
    const todayMs = performance.now() - todayStart;
    const todayCounts = { ...harness.db.counts };
    expect(today.ok).toBe(true);

    harness.db.resetCounts();
    const historyStart = performance.now();
    const history = await getHistory(harness.deps, { timezone: 'UTC', limit: 200 });
    const historyMs = performance.now() - historyStart;
    const historyCounts = { ...harness.db.counts };
    if (!history.ok) throw new Error('history failed');

    harness.db.resetCounts();
    const detailStart = performance.now();
    const detail = await getDayDetail(harness.deps, {
      dayKey: '2026-09-22',
      timezone: 'UTC',
    });
    const detailMs = performance.now() - detailStart;
    const detailCounts = { ...harness.db.counts };
    expect(detail.ok).toBe(true);

    console.log(
      `[perf] getToday: ${todayMs.toFixed(1)}ms ${JSON.stringify(todayCounts)}`,
    );
    console.log(
      `[perf] getHistory(${DAYS + 1} days): ${historyMs.toFixed(1)}ms ${JSON.stringify(
        historyCounts,
      )}`,
    );
    console.log(
      `[perf] getDayDetail: ${detailMs.toFixed(1)}ms ${JSON.stringify(detailCounts)}`,
    );
    console.log(
      `[perf] rows: sessions=${DAYS + 1} entries=${DAYS * ENTRIES_PER_DAY + TODAY_ENTRIES}`,
    );

    expect(todayMs).toBeLessThan(250);
    expect(historyMs).toBeLessThan(3000);
    expect(detailMs).toBeLessThan(500);
    // Locked regressions: one query for sessions plus one for entries per read
    // model, never one query per session.
    expect(todayCounts.getAll).toBeLessThanOrEqual(3);
    expect(historyCounts.getAll).toBeLessThanOrEqual(3);
    expect(detailCounts.getAll).toBeLessThanOrEqual(3);
  });

  it('reconciles without rewriting unchanged reminder metadata', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    expect(reminders.pending.size).toBe(48);

    harness.db.resetCounts();
    const firstStart = performance.now();
    const first = await reconcile(harness.deps);
    const firstMs = performance.now() - firstStart;
    const firstCounts = { ...harness.db.counts };
    expect(first.ok).toBe(true);

    harness.db.resetCounts();
    const secondStart = performance.now();
    const second = await reconcile(harness.deps);
    const secondMs = performance.now() - secondStart;
    const secondCounts = { ...harness.db.counts };
    expect(second.ok).toBe(true);

    console.log(
      `[perf] reconcile first: ${firstMs.toFixed(1)}ms ${JSON.stringify(firstCounts)}`,
    );
    console.log(
      `[perf] reconcile repeat: ${secondMs.toFixed(1)}ms ${JSON.stringify(secondCounts)}`,
    );
    if (!second.ok) return;
    expect(second.value.reminder.scheduled).toBe(0);
    expect(second.value.reminder.pendingCount).toBe(48);
    // A repeat reconcile with identical state must not write reminder metadata.
    expect(secondCounts.run).toBe(0);
    expect(firstCounts.run).toBeLessThanOrEqual(1);
  });
});
