import type { ReminderPermission } from './types';

export interface PermissionStatusLike {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Android 13+ maps the system dialog result to expo's permission status:
 * a first denial can still be asked again, a permanent one cannot.
 */
export function permissionFromStatus(status: PermissionStatusLike): ReminderPermission {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}
