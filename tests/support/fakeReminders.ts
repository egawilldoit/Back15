import type {
  PendingReminder,
  PresentedReminder,
  ReminderPayload,
  ReminderPermission,
  ReminderPort,
} from '../../src/reminders/types';

export class FakeReminderPort implements ReminderPort {
  permission: ReminderPermission = 'granted';
  requestResult: ReminderPermission | null = null;
  failSchedule = false;
  failCancel = false;
  failList = false;
  failDismiss = false;
  scheduled: ReminderPayload[] = [];
  cancelled: string[] = [];
  dismissed: string[] = [];
  pending = new Map<string, PendingReminder>();
  presented: PresentedReminder[] = [];
  private counter = 0;

  async getPermission(): Promise<ReminderPermission> {
    return this.permission;
  }

  async requestPermission(): Promise<ReminderPermission> {
    if (this.requestResult) this.permission = this.requestResult;
    return this.permission;
  }

  async ensureChannel(): Promise<void> {}

  async schedule(payload: ReminderPayload): Promise<string> {
    if (this.failSchedule) throw new Error('schedule failed');
    this.counter += 1;
    const nativeId = `native-${this.counter}`;
    this.scheduled.push(payload);
    this.pending.set(nativeId, { nativeId, payload });
    return nativeId;
  }

  async listPending(): Promise<PendingReminder[]> {
    if (this.failList) throw new Error('listPending failed');
    return [...this.pending.values()];
  }

  async cancel(nativeId: string): Promise<void> {
    if (this.failCancel) throw new Error('cancel failed');
    this.cancelled.push(nativeId);
    this.pending.delete(nativeId);
  }

  async listPresented(): Promise<PresentedReminder[]> {
    if (this.failList) throw new Error('listPresented failed');
    return [...this.presented];
  }

  async dismiss(nativeId: string): Promise<void> {
    if (this.failDismiss) throw new Error('dismiss failed');
    this.dismissed.push(nativeId);
    this.presented = this.presented.filter((item) => item.nativeId !== nativeId);
  }

  /** Simulates an OS request that exists without stored metadata. */
  addOrphan(payload: ReminderPayload): string {
    this.counter += 1;
    const nativeId = `native-${this.counter}`;
    this.pending.set(nativeId, { nativeId, payload });
    return nativeId;
  }
}
