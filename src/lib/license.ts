/**
 * DWO Tauri Bridge - License Operations (Phase 3)
 */

import { invoke } from '@/lib/tauri';

export type Tier = 'free' | 'pro';

export async function licenseActivate(key: string, machineId?: string): Promise<boolean> {
  return invoke<boolean>('activate', { key, machine_id: machineId ?? null });
}

export async function licenseStatus(): Promise<Tier> {
  return invoke<Tier>('status');
}

export async function licenseDeactivate(): Promise<boolean> {
  return invoke<boolean>('deactivate');
}
