export interface LockAdapter {
  read(userId: string): Promise<boolean>;
  write(userId: string, enabled: boolean): Promise<void>;
  available(): Promise<boolean>;
  authenticate(): Promise<boolean>;
}
export interface LockState {
  owner: string | null;
  ready: boolean;
  enabled: boolean;
  unlocked: boolean;
  active: boolean;
  busy: boolean;
  error: string;
}

// The local lock controls visibility. Server sessions remain the authorization boundary.
export class AppLockController {
  private state: LockState = {
    owner: null,
    ready: false,
    enabled: false,
    unlocked: false,
    active: true,
    busy: false,
    error: '',
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private backgroundEpoch = 0;
  constructor(private adapter: LockAdapter) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: Partial<LockState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }
  async select(owner: string | null) {
    const generation = ++this.generation;
    this.update({ owner, ready: !owner, enabled: false, unlocked: false, busy: false, error: '' });
    if (!owner) return;
    try {
      const enabled = await this.adapter.read(owner);
      if (generation === this.generation) this.update({ ready: true, enabled });
    } catch {
      if (generation === this.generation)
        this.update({ error: 'Cannot read app-lock settings. Retry or sign out on this device.' });
    }
  }
  lifecycle(state: 'active' | 'inactive' | 'background') {
    if (state === 'background') ++this.backgroundEpoch;
    this.update({
      active: state === 'active',
      ...(state === 'background' ? { unlocked: false } : {}),
    });
  }
  lock() {
    this.update({ unlocked: false });
  }
  private async challenge(action: 'unlock' | 'enable' | 'disable') {
    const { owner, ready, busy, enabled, active } = this.state;
    if (!owner || !ready || busy || !active || (action !== 'enable' && !enabled)) return;
    const generation = this.generation;
    const epoch = this.backgroundEpoch;
    const current = () => generation === this.generation && epoch === this.backgroundEpoch;
    this.update({ busy: true, error: '' });
    try {
      if (!(await this.adapter.available()))
        throw new Error('Enroll a strong fingerprint or face biometric in device settings first.');
      if (!current()) return;
      if (!(await this.adapter.authenticate()))
        throw new Error('Authentication was cancelled or unsuccessful. You can retry.');
      if (!current()) return;
      if (action !== 'unlock') {
        await this.adapter.write(owner, action === 'enable');
        if (generation === this.generation)
          this.update({ enabled: action === 'enable', unlocked: current() && this.state.active });
      } else if (current()) this.update({ unlocked: true });
    } catch (failure) {
      if (current())
        this.update({
          error: failure instanceof Error ? failure.message : 'Could not authenticate. Retry.',
        });
    } finally {
      if (generation === this.generation) this.update({ busy: false });
    }
  }
  unlock = () => this.challenge('unlock');
  enable = () => this.challenge('enable');
  disable = () => this.challenge('disable');
  async resetAfterSignOut(owner: string) {
    await this.adapter.write(owner, false);
  }
}
