import { describe, expect, it } from 'vitest';
import { permissionFromStatus } from './permission';

describe('notification permission mapping', () => {
  it('treats a granted status as granted', () => {
    expect(permissionFromStatus({ granted: true, canAskAgain: true })).toBe('granted');
    expect(permissionFromStatus({ granted: true, canAskAgain: false })).toBe('granted');
  });

  it('keeps a first denial askable', () => {
    expect(permissionFromStatus({ granted: false, canAskAgain: true })).toBe(
      'undetermined',
    );
  });

  it('reports a permanent denial as denied', () => {
    expect(permissionFromStatus({ granted: false, canAskAgain: false })).toBe('denied');
  });
});
