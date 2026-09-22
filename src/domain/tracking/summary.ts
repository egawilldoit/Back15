import { effectiveEndMs } from '../time/boundaries';
import { clipRange, intersectRanges, mergeRanges, subtractRanges, totalDuration, unionDuration } from '../time/interval';
import type { Millis, TimeRange } from '../time/types';
import { completedCutoff, coveredRanges, liveEntries, unresolvedComponents } from './proposals';
import type {
  CategoryKey,
  DaySummary,
  Entry,
  Session,
  SessionSummary,
  TimelineItem,
} from './types';

function emptyCategories(): Record<CategoryKey, Millis> {
  return {
    work: 0,
    learning: 0,
    personal: 0,
    break: 0,
    other: 0,
    uncategorized: 0,
  };
}

function categoryKey(entry: Entry): CategoryKey {
  return entry.category ?? 'uncategorized';
}

function sessionClip(session: Session, now: Millis, window: TimeRange): TimeRange | null {
  return intersectRanges(
    { startAt: session.startedAt, endAt: effectiveEndMs(session, now) },
    window,
  );
}

export function summarizeSession(
  session: Session,
  entries: readonly Entry[],
  now: Millis,
  window: TimeRange,
): SessionSummary | null {
  const clipped = sessionClip(session, now, window);
  if (!clipped) return null;
  const live = liveEntries(entries);
  const loggedRanges = live
    .filter((entry) => entry.kind === 'logged')
    .map((entry) => clipRange({ startAt: entry.startAt, endAt: entry.endAt }, clipped))
    .filter((range): range is TimeRange => range !== null);
  const skippedRanges = live
    .filter((entry) => entry.kind === 'skipped')
    .map((entry) => clipRange({ startAt: entry.startAt, endAt: entry.endAt }, clipped))
    .filter((range): range is TimeRange => range !== null);

  const categories = emptyCategories();
  for (const entry of live) {
    if (entry.kind !== 'logged') continue;
    const clippedEntry = clipRange({ startAt: entry.startAt, endAt: entry.endAt }, clipped);
    if (!clippedEntry) continue;
    categories[categoryKey(entry)] += totalDuration([clippedEntry]);
  }

  const recordedMs = unionDuration(loggedRanges);
  const skippedMs = unionDuration(skippedRanges);
  const unresolvedMs = unionDuration(
    subtractRanges(clipped, [...loggedRanges, ...skippedRanges]),
  );
  const cutoff = completedCutoff(session, now);
  const completedWindow = intersectRanges(clipped, {
    startAt: session.startedAt,
    endAt: Math.max(cutoff, session.startedAt),
  });
  const completedUnresolvedMs = completedWindow
    ? unionDuration(subtractRanges(completedWindow, coveredRanges(session, live, now)))
    : 0;

  return {
    session,
    effectiveEndAt: effectiveEndMs(session, now),
    elapsedMs: totalDuration([clipped]),
    recordedMs,
    skippedMs,
    unresolvedMs,
    completedUnresolvedMs,
    categories,
    entries: live.filter((entry) => intersectRanges(
      { startAt: entry.startAt, endAt: entry.endAt },
      clipped,
    ) !== null),
    clippedRange: clipped,
  };
}

export function buildTimeline(
  window: TimeRange,
  sessions: readonly Session[],
  entries: readonly Entry[],
  now: Millis,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const session of sessions) {
    const clipped = sessionClip(session, now, window);
    if (!clipped) continue;
    const live = liveEntries(entries).filter((entry) => entry.sessionId === session.id);
    for (const entry of live) {
      const entryClipped = clipRange({ startAt: entry.startAt, endAt: entry.endAt }, clipped);
      if (!entryClipped) continue;
      items.push({
        type: 'entry',
        entry,
        range: { startAt: entry.startAt, endAt: entry.endAt },
        clippedRange: entryClipped,
      });
    }
    const cutoff = completedCutoff(session, now);
    for (const component of unresolvedComponents(session, live, now)) {
      const componentClipped = intersectRanges(component, clipped);
      if (!componentClipped) continue;
      const crossesCutoff =
        componentClipped.startAt < cutoff && componentClipped.endAt > cutoff;
      if (crossesCutoff) {
        items.push({
          type: 'unresolved',
          range: { startAt: componentClipped.startAt, endAt: cutoff },
          clippedRange: { startAt: componentClipped.startAt, endAt: cutoff },
          current: false,
          resolvable: true,
        });
        items.push({
          type: 'unresolved',
          range: { startAt: cutoff, endAt: componentClipped.endAt },
          clippedRange: { startAt: cutoff, endAt: componentClipped.endAt },
          current: true,
          resolvable: false,
        });
      } else {
        const isCurrent = componentClipped.startAt >= cutoff && session.status === 'active';
        items.push({
          type: 'unresolved',
          range: componentClipped,
          clippedRange: componentClipped,
          current: isCurrent,
          resolvable: !isCurrent,
        });
      }
    }
  }
  return items.sort((a, b) => {
    const startDiff = a.clippedRange.startAt - b.clippedRange.startAt;
    if (startDiff !== 0) return startDiff;
    if (a.type === b.type) return 0;
    return a.type === 'entry' ? -1 : 1;
  });
}

export function summarizeDay(
  dayKey: string,
  window: TimeRange,
  sessions: readonly Session[],
  entries: readonly Entry[],
  now: Millis,
): DaySummary {
  const summaries: SessionSummary[] = [];
  for (const session of sessions) {
    const summary = summarizeSession(session, entries, now, window);
    if (summary) summaries.push(summary);
  }
  const categories = emptyCategories();
  let elapsedMs = 0;
  let recordedMs = 0;
  let skippedMs = 0;
  let unresolvedMs = 0;
  let completedUnresolvedMs = 0;
  for (const summary of summaries) {
    elapsedMs += summary.elapsedMs;
    recordedMs += summary.recordedMs;
    skippedMs += summary.skippedMs;
    unresolvedMs += summary.unresolvedMs;
    completedUnresolvedMs += summary.completedUnresolvedMs;
    for (const key of Object.keys(categories) as CategoryKey[]) {
      categories[key] += summary.categories[key];
    }
  }
  return {
    dayKey,
    window,
    elapsedMs,
    recordedMs,
    skippedMs,
    unresolvedMs,
    completedUnresolvedMs,
    categories,
    sessions: summaries,
    timeline: buildTimeline(window, sessions, entries, now),
  };
}

/** Merge helper re-exported for read models that need raw component math. */
export function mergedRanges(ranges: readonly TimeRange[]): TimeRange[] {
  return mergeRanges(ranges);
}
