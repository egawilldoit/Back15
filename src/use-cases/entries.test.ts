import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { utc } from '../../tests/support/fixtures';
import { createHarness } from '../../tests/support/harness';
import type { Harness } from '../../tests/support/harness';
import { listLiveEntriesForSession } from '../storage/repositories/entries';
import {
  continuePrevious,
  createEntry,
  deleteEntry,
  skipRange,
  updateEntry,
} from './entries';
import { startSession, stopSession } from './sessions';

const T = utc(2026, 9, 22, 10);
const MIN = 60_000;

describe('entry writes', () => {
  let harness: Harness;
  let sessionId: string;

  beforeEach(async () => {
    harness = await createHarness({ now: T });
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    sessionId = started.value.session.id;
    harness.setNow(T + 60 * MIN);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('saves a logged entry with a real partial range', async () => {
    const result = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T + 15 * MIN, endAt: T + 22 * MIN },
      description: '  wrote the report  ',
      category: 'work',
      actionId: 'action-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.description).toBe('wrote the report');
    expect(result.value.endAt - result.value.startAt).toBe(7 * MIN);
    expect(result.value.origin).toBe('typed');
  });

  it('returns the same row when the same action id is retried', async () => {
    const input = {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'First task',
      actionId: 'action-1',
    };
    const first = await createEntry(harness.deps, input);
    const second = await createEntry(harness.deps, input);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.id).toBe(first.value.id);
    expect(await listLiveEntriesForSession(harness.db, sessionId)).toHaveLength(1);
  });

  it('lets one competing write win and rejects the other without partial mutation', async () => {
    const first = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'First task',
      actionId: 'action-1',
    });
    const second = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T + 10 * MIN, endAt: T + 25 * MIN },
      description: 'Second task',
      actionId: 'action-2',
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('RANGE_OVERLAP');
      expect(second.error.details.conflictingRange).toEqual({
        startAt: T,
        endAt: T + 15 * MIN,
      });
    }
    expect(await listLiveEntriesForSession(harness.db, sessionId)).toHaveLength(1);
  });

  it('allows adjacent entries and rejects out-of-session spans', async () => {
    const first = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'First task',
      actionId: 'action-1',
    });
    expect(first.ok).toBe(true);
    const adjacent = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T + 15 * MIN, endAt: T + 30 * MIN },
      description: 'Second task',
      actionId: 'action-2',
    });
    expect(adjacent.ok).toBe(true);
    const outside = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T - 10 * MIN, endAt: T },
      description: 'Before session',
      actionId: 'action-3',
    });
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.error.code).toBe('RANGE_OUTSIDE_SESSION');
  });

  it('rejects blank text and unknown categories', async () => {
    const blank = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: '   ',
      actionId: 'action-1',
    });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.error.code).toBe('INVALID_TEXT');
    const unknown = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'Task',
      category: 'hacking' as never,
      actionId: 'action-2',
    });
    expect(unknown.ok).toBe(false);
  });

  it('stores an explicit skipped span with no description', async () => {
    const result = await skipRange(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      actionId: 'action-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('skipped');
    expect(result.value.description).toBeNull();
    expect(result.value.category).toBeNull();
    expect(result.value.origin).toBe('skipped');
  });

  it('copies the previous description and category into a new entry', async () => {
    const first = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'Deep work',
      category: 'work',
      actionId: 'action-1',
    });
    if (!first.ok) throw new Error('first failed');
    const continued = await continuePrevious(harness.deps, {
      sessionId,
      range: { startAt: T + 15 * MIN, endAt: T + 30 * MIN },
      actionId: 'action-2',
    });
    expect(continued.ok).toBe(true);
    if (!continued.ok) return;
    expect(continued.value.id).not.toBe(first.value.id);
    expect(continued.value.description).toBe('Deep work');
    expect(continued.value.category).toBe('work');
    expect(continued.value.origin).toBe('continued');
    const original = await listLiveEntriesForSession(harness.db, sessionId);
    expect(original.find((entry) => entry.id === first.value.id)?.description).toBe(
      'Deep work',
    );
  });

  it('reports no previous entry when nothing can be continued', async () => {
    const result = await continuePrevious(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      actionId: 'action-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NO_PREVIOUS_ENTRY');
  });

  it('supports historical backfill inside a closed session', async () => {
    await stopSession(harness.deps, { sessionId, endedAt: T + 60 * MIN });
    const result = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T + 30 * MIN, endAt: T + 45 * MIN },
      description: 'Backfilled task',
      origin: 'backfilled',
      actionId: 'action-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.origin).toBe('backfilled');
    const outside = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T + 55 * MIN, endAt: T + 70 * MIN },
      description: 'Past the end',
      actionId: 'action-2',
    });
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.error.code).toBe('RANGE_OUTSIDE_SESSION');
  });
});

describe('entry edits and deletion', () => {
  let harness: Harness;
  let sessionId: string;

  beforeEach(async () => {
    harness = await createHarness({ now: T });
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    sessionId = started.value.session.id;
    harness.setNow(T + 60 * MIN);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('updates description, category and bounds with a revision bump', async () => {
    const created = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'First task',
      actionId: 'action-1',
    });
    if (!created.ok) throw new Error('create failed');
    const updated = await updateEntry(harness.deps, {
      entryId: created.value.id,
      expectedRevision: 1,
      changes: {
        startAt: T,
        endAt: T + 20 * MIN,
        kind: 'logged',
        description: 'First task, refined',
        category: 'learning',
      },
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.revision).toBe(2);
    expect(updated.value.endAt).toBe(T + 20 * MIN);
    expect(updated.value.category).toBe('learning');
  });

  it('rejects a stale revision without overwriting the newer edit', async () => {
    const created = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'First task',
      actionId: 'action-1',
    });
    if (!created.ok) throw new Error('create failed');
    await updateEntry(harness.deps, {
      entryId: created.value.id,
      expectedRevision: 1,
      changes: { startAt: T, endAt: T + 15 * MIN, kind: 'logged', description: 'Newer' },
    });
    const stale = await updateEntry(harness.deps, {
      entryId: created.value.id,
      expectedRevision: 1,
      changes: { startAt: T, endAt: T + 15 * MIN, kind: 'logged', description: 'Stale' },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.code).toBe('REVISION_CONFLICT');
      expect(stale.error.details.latestRevision).toBe(2);
    }
    const live = await listLiveEntriesForSession(harness.db, sessionId);
    expect(live[0].description).toBe('Newer');
  });

  it('rejects an edit that overlaps a neighbor', async () => {
    const first = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'First task',
      actionId: 'action-1',
    });
    const second = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T + 15 * MIN, endAt: T + 30 * MIN },
      description: 'Second task',
      actionId: 'action-2',
    });
    if (!first.ok || !second.ok) throw new Error('setup failed');
    const conflict = await updateEntry(harness.deps, {
      entryId: first.value.id,
      expectedRevision: 1,
      changes: {
        startAt: T,
        endAt: T + 16 * MIN,
        kind: 'logged',
        description: 'First task',
      },
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe('RANGE_OVERLAP');
  });

  it('turns a skipped span into a logged entry and back', async () => {
    const skipped = await skipRange(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      actionId: 'action-1',
    });
    if (!skipped.ok) throw new Error('skip failed');
    const logged = await updateEntry(harness.deps, {
      entryId: skipped.value.id,
      expectedRevision: 1,
      changes: {
        startAt: T,
        endAt: T + 15 * MIN,
        kind: 'logged',
        description: 'Actually worked',
        category: null,
      },
    });
    expect(logged.ok).toBe(true);
    if (!logged.ok) return;
    expect(logged.value.kind).toBe('logged');
    expect(logged.value.origin).toBe('typed');
    const back = await updateEntry(harness.deps, {
      entryId: skipped.value.id,
      expectedRevision: 2,
      changes: { startAt: T, endAt: T + 15 * MIN, kind: 'skipped' },
    });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.description).toBeNull();
  });

  it('tombstones a deleted entry and reports stale deletes', async () => {
    const created = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'First task',
      actionId: 'action-1',
    });
    if (!created.ok) throw new Error('create failed');
    const deleted = await deleteEntry(harness.deps, {
      entryId: created.value.id,
      expectedRevision: 1,
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.deletedAt).not.toBeNull();
    expect(deleted.value.revision).toBe(2);
    expect(await listLiveEntriesForSession(harness.db, sessionId)).toHaveLength(0);
    const again = await deleteEntry(harness.deps, {
      entryId: created.value.id,
      expectedRevision: 2,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('ENTRY_DELETED');
  });
});
