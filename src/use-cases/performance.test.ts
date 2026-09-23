import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { utc } from '../../tests/support/fixtures';
import { createHarness } from '../../tests/support/harness';
import type { Harness } from '../../tests/support/harness';
import { getDayDetail, getHistory, getToday } from './readModels';

const DAYS = 120;
const ENTRIES_PER_DAY = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN = 60_000;

async function seedMonths(harness: Harness) {
  const base = utc(2026, 5, 1, 9);
  for (let day = 0; day < DAYS; day += 1) {
    const startedAt = base + day * DAY_MS;
    const endedAt = startedAt + 8 * 15 * MIN;
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

describe('read models with months of realistic data', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness({ now: utc(2026, 9, 1, 9) });
    await seedMonths(harness);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('lists the history and a day detail without precomputed totals', async () => {
    const historyStart = Date.now();
    const history = await getHistory(harness.deps, { timezone: 'UTC', limit: 200 });
    const historyMs = Date.now() - historyStart;
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value).toHaveLength(DAYS);
    expect(history.value[0].recordedMs).toBe(2 * 60 * MIN);
    expect(historyMs).toBeLessThan(4000);

    const dayStart = Date.now();
    const detail = await getDayDetail(harness.deps, {
      dayKey: history.value[10].dayKey,
      timezone: 'UTC',
    });
    expect(Date.now() - dayStart).toBeLessThan(1000);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.summary.timeline).toHaveLength(ENTRIES_PER_DAY);

    const today = await getToday(harness.deps, { timezone: 'UTC' });
    expect(today.ok).toBe(true);
    if (!today.ok) return;
    expect(today.value.summary.elapsedMs).toBe(0);
  });
});
