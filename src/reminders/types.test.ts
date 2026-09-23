import { describe, expect, it } from 'vitest';
import { REMINDER_PAYLOAD_VERSION, parseReminderPayload } from './types';

describe('reminder payload parsing', () => {
  it('accepts a versioned local payload with no private text', () => {
    const payload = parseReminderPayload({
      version: REMINDER_PAYLOAD_VERSION,
      sessionId: 'session-1',
      dueAt: 1_790_000_000_000,
    });
    expect(payload).toEqual({
      version: REMINDER_PAYLOAD_VERSION,
      sessionId: 'session-1',
      dueAt: 1_790_000_000_000,
    });
    expect(Object.keys(payload ?? {})).not.toContain('description');
  });

  it('rejects malformed or foreign payloads', () => {
    expect(parseReminderPayload(null)).toBeNull();
    expect(parseReminderPayload('session-1')).toBeNull();
    expect(parseReminderPayload({})).toBeNull();
    expect(parseReminderPayload({ version: 1, sessionId: '', dueAt: 1 })).toBeNull();
    expect(parseReminderPayload({ version: 1, sessionId: 'a', dueAt: 'soon' })).toBeNull();
  });
});
