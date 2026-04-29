/**
 * License / trial (Phase 1) — per-machine DTOs shared with renderer via IPC.
 * Persistent state lives in the main process (userData), not in the company database.
 */

export const TRIAL_DAYS = 14;

export type LicenseMode = 'none' | 'trial' | 'licensed';

export type SignedLicense = {
  license_key: string;
  license_type?: 'trial' | 'paid' | string;
  company_name?: string;
  machine_id: string;
  issued_at?: string;
  expiry: string;
  features?: string[];
  max_devices?: number;
  signature?: string;
};

export type LicenseGetStatusResult = {
  mode: LicenseMode;
  /** True when the user must complete the license onboarding flow (new install or trial expired). */
  shouldShowOnboarding: boolean;
  /** When false, the shell should not open the main desk until license/trial is resolved. */
  canAccessApp: boolean;
  trialStartedAtIso: string | null;
  trialEndsAtIso: string | null;
  trialDaysRemaining: number | null;
  /** Only for mode === 'none' — first-time choice. False when trial expired (only key entry). */
  allowStartTrial: boolean;
  machineId: string;
  /** Set when the license server rejected access (e.g. after weekly validation). */
  licenseServerMessage?: string | null;
  /** Current local license expiry timestamp (trial or paid). */
  licenseExpiryAtIso?: string | null;
};

export type LicenseStartTrialResult =
  | { success: true }
  | { success: false; error: string };

export type LicenseSubmitKeyResult =
  | { success: true }
  | { success: false; error: string };

export type LicenseInstallJsonResult =
  | { success: true }
  | { success: false; error: string };
