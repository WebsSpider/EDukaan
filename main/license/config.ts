/**
 * License API — public base URL can stay in code; override with
 * EDUKAN_LICENSE_API_BASE_URL for staging.
 *
 * Trial keys are per machine: `${prefix}${machineId}`. The worker auto-creates the
 * KV row on first /activate when the key matches this prefix and equals
 * prefix + machine_id.
 */
export const DEFAULT_LICENSE_API_BASE =
  'https://edukan-api.aurobotix.com';

export const DEFAULT_TRIAL_LICENSE_PREFIX = 'EDUKAN-TRIAL-';

export function getLicenseApiBaseUrl(): string {
  const raw = (
    process.env.EDUKAN_LICENSE_API_BASE_URL ?? DEFAULT_LICENSE_API_BASE
  ).trim();
  return raw.replace(/\/$/, '');
}

/** Prefix for auto-provisioned trial licenses (must match worker TRIAL_LICENSE_PREFIX). */
export function getTrialLicensePrefix(): string {
  return (
    process.env.EDUKAN_TRIAL_LICENSE_PREFIX ?? DEFAULT_TRIAL_LICENSE_PREFIX
  ).trim();
}

export function getTrialLicenseKeyForMachine(machineId: string): string {
  return `${getTrialLicensePrefix()}${machineId.trim()}`;
}

export function isTrialLicenseKey(licenseKey: string | undefined): boolean {
  const k = licenseKey?.trim() ?? '';
  return k.startsWith(getTrialLicensePrefix());
}
