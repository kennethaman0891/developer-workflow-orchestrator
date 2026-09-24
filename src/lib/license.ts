/**
 * DWO Tauri Bridge - License Operations (Phase 3)
 */

import { invoke } from '@/lib/tauri';

export type Tier = 'free' | 'pro';

export interface LicenseStatus {
  tier: Tier;
  activated_at: string;
  expires_at: string | null;
}

export async function licenseActivate(key: string): Promise<boolean> {
  return invoke<boolean>('license_activate', { key });
}

export async function licenseStatus(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>('license_status');
}

export async function licenseDeactivate(): Promise<boolean> {
  return invoke<boolean>('license_deactivate');
}
