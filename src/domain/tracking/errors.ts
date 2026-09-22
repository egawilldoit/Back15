import type { TimeRange } from '../time/types';

export type TrackingErrorCode =
  | 'STORAGE_FAILURE'
  | 'MIGRATION_FAILED'
  | 'NO_ACTIVE_SESSION'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'INVALID_RANGE'
  | 'RANGE_OUTSIDE_SESSION'
  | 'RANGE_OVERLAP'
  | 'INVALID_TEXT'
  | 'REVISION_CONFLICT'
  | 'ENTRY_NOT_FOUND'
  | 'ENTRY_DELETED'
  | 'NO_PREVIOUS_ENTRY'
  | 'SESSION_END_BEFORE_ENTRY'
  | 'CLOCK_ANOMALY'
  | 'NATIVE_REMINDER_FAILURE';

export interface TrackingErrorDetails {
  conflictingRange?: TimeRange;
  latestRevision?: number;
  sessionId?: string;
  entryId?: string;
  [key: string]: unknown;
}

export class TrackingError extends Error {
  readonly code: TrackingErrorCode;
  readonly details: TrackingErrorDetails;

  constructor(code: TrackingErrorCode, message: string, details: TrackingErrorDetails = {}) {
    super(message);
    this.name = 'TrackingError';
    this.code = code;
    this.details = details;
  }
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: TrackingError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(
  code: TrackingErrorCode,
  message: string,
  details?: TrackingErrorDetails,
): Result<T> {
  return { ok: false, error: new TrackingError(code, message, details) };
}

export function isTrackingError(value: unknown): value is TrackingError {
  return value instanceof TrackingError;
}
