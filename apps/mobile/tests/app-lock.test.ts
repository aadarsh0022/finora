import { describe, expect, it } from 'vitest';
import { AppLockController, type LockAdapter } from '../src/security/app-lock';

function harness(enabled = false) {
  const policies = new Map([
    ['alice', enabled],
    ['bob', false],
  ]);
  const adapter: LockAdapter = {
    read: async (owner) => policies.get(owner) ?? false,
    write: async (owner, value) => {
      policies.set(owner, value);
    },
    available: async () => true,
    authenticate: async () => true,
  };
  return { controller: new AppLockController(adapter), adapter, policies };
}
describe('local biometric app lock', () => {
  it('starts locked, requires authentication and relocks after backgrounding', async () => {
    const { controller } = harness(true);
    await controller.select('alice');
    expect(controller.snapshot()).toMatchObject({ ready: true, enabled: true, unlocked: false });
    await controller.unlock();
    expect(controller.snapshot().unlocked).toBe(true);
    controller.lifecycle('background');
    controller.lifecycle('active');
    expect(controller.snapshot().unlocked).toBe(false);
  });
  it('does not persist enablement after a cancelled or unavailable biometric', async () => {
    const { controller, adapter, policies } = harness();
    await controller.select('alice');
    adapter.authenticate = async () => false;
    await controller.enable();
    expect(policies.get('alice')).toBe(false);
    expect(controller.snapshot().error).toContain('cancelled');
    adapter.available = async () => false;
    await controller.enable();
    expect(controller.snapshot().error).toContain('Enroll');
    expect(controller.snapshot().enabled).toBe(false);
  });
  it('cannot disable protection without a successful biometric', async () => {
    const { controller, adapter, policies } = harness(true);
    await controller.select('alice');
    adapter.authenticate = async () => false;
    await controller.disable();
    expect(policies.get('alice')).toBe(true);
    expect(controller.snapshot().enabled).toBe(true);
    adapter.authenticate = async () => true;
    await controller.disable();
    expect(policies.get('alice')).toBe(false);
  });
  it('ignores late authentication when the app backgrounds or account changes', async () => {
    const { controller, adapter } = harness(true);
    let finish: (value: boolean) => void = () => {
      throw new Error('Prompt not started');
    };
    adapter.authenticate = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await controller.select('alice');
    const attempt = controller.unlock();
    await Promise.resolve();
    controller.lifecycle('background');
    controller.lifecycle('active');
    finish(true);
    await attempt;
    expect(controller.snapshot().unlocked).toBe(false);
    const second = controller.unlock();
    await Promise.resolve();
    await controller.select('bob');
    finish(true);
    await second;
    expect(controller.snapshot()).toMatchObject({ owner: 'bob', enabled: false, unlocked: false });
  });
  it('fails closed on unreadable settings and ignores a late prior-account read', async () => {
    const { controller, adapter } = harness();
    adapter.read = async () => {
      throw new Error('Storage unavailable');
    };
    await controller.select('alice');
    expect(controller.snapshot()).toMatchObject({ ready: false, unlocked: false });
    expect(controller.snapshot().error).toContain('Cannot read');
    let finish: (value: boolean) => void = () => {
      throw new Error('Read not started');
    };
    adapter.read = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const oldRead = controller.select('alice');
    await controller.select(null);
    finish(true);
    await oldRead;
    expect(controller.snapshot()).toMatchObject({ owner: null, ready: true, enabled: false });
  });
  it('retains enabled protection if backgrounding during secure persistence', async () => {
    const { controller, adapter } = harness();
    let finish: () => void = () => {
      throw new Error('Write not started');
    };
    adapter.write = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await controller.select('alice');
    const enabling = controller.enable();
    await Promise.resolve();
    await Promise.resolve();
    controller.lifecycle('background');
    finish();
    await enabling;
    controller.lifecycle('active');
    expect(controller.snapshot()).toMatchObject({ enabled: true, unlocked: false });
  });
});
