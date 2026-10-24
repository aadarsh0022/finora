import type { DeviceVault } from '../storage/vault-core';
import { z } from 'zod';
import { reminderPrefix, type ReminderPlan } from './planning';

export interface ReminderDriver {
  list(): Promise<string[]>;
  cancel(id: string): Promise<void>;
  schedule(plan: ReminderPlan): Promise<void>;
}

export async function reconcileReminders(
  driver: ReminderDriver,
  vault: DeviceVault,
  plans: ReminderPlan[],
  isCurrent: () => boolean,
) {
  const existing = (await driver.list()).filter((id) => id.startsWith(reminderPrefix));
  const desired = new Map(plans.map((plan) => [plan.id, plan]));
  for (const id of existing) {
    if (!isCurrent()) return;
    if (!desired.has(id)) await driver.cancel(id);
  }
  for (const plan of plans) {
    if (!isCurrent()) return;
    if (existing.includes(plan.id)) continue;
    const marker = `reminder-seen:${plan.id}`;
    if (plan.kind === 'budget' && (await vault.read(marker, z.literal(true), Infinity))) continue;
    if (!isCurrent()) return;
    await driver.schedule(plan);
    if (plan.kind === 'budget') await vault.write(marker, true);
  }
  // Keep budget markers bounded without forgetting the current month's delivery.
  const markers = await vault.list('reminder-seen:', z.literal(true));
  for (const row of markers.sort((a, b) => b.updated - a.updated).slice(500))
    await vault.remove(row.key);
}
