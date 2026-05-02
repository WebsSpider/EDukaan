import type {
  LicenseInstallJsonResult,
  LicenseGetStatusResult,
  LicenseStartTrialResult,
  SignedLicense,
  LicenseSubmitKeyResult,
} from '../../utils/license/types';
import { getMachineId } from './machineId';
import { activateLicenseViaApi, validateLicenseOnline } from './api';
import { getTrialLicenseKeyForMachine, isTrialLicenseKey } from './config';
import { readState, writeLicense, patchPersistedState } from './licenseStore';
import { verifyLicenseRsaSignature } from './verifySignature';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;
const CLOCK_ROLLBACK_BLOCK_REASON =
  'System clock rollback detected. Set your device date/time to automatic, then restart EDukan.';

function daysRemaining(endIso: string): number {
  const remainingMs = new Date(endIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
}

function licenseModeFromKey(license: SignedLicense): 'trial' | 'licensed' {
  return isTrialLicenseKey(license.license_key) ? 'trial' : 'licensed';
}

function activationCompanyName(companyName: string): string {
  return typeof companyName === 'string' ? companyName.trim() : '';
}

/** Expiry and machine binding (after signature is verified). */
function validateOfflineFields(
  license: SignedLicense,
  machineId: string
): { valid: boolean; reason?: string } {
  if (!license?.license_key || !license.expiry || !license.machine_id) {
    return { valid: false, reason: 'License file is incomplete.' };
  }
  if (license.machine_id !== machineId) {
    return {
      valid: false,
      reason: 'This license is not bound to this machine.',
    };
  }
  if (new Date(license.expiry).getTime() <= Date.now()) {
    return { valid: false, reason: 'License has expired.' };
  }
  return { valid: true };
}

function isTransientLicenseApiFailure(message: string): boolean {
  if (
    /License API request failed \((500|502|503|504)\)/.test(message) ||
    message === 'License API request failed (500)'
  ) {
    return true;
  }
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|fetch failed|getaddrinfo|certificate|SSL/i.test(
    message
  );
}

/**
 * Runs at most once per app session path; skips if under 7 days since last success.
 * Offline / transient errors do not advance the clock (will retry on a later launch).
 */
export async function runWeeklyOnlineLicenseCheckIfDue(): Promise<void> {
  if (process.env.EDUKAN_UITEST_SKIP_LICENSE === '1') {
    return;
  }

  const state = await readState();
  if (!state.license?.license_key) {
    return;
  }
  if (state.onlineAccessBlockedReason) {
    return;
  }

  if (!state.lastOnlineValidateAtIso) {
    await patchPersistedState({
      lastOnlineValidateAtIso: new Date().toISOString(),
    });
    return;
  }

  const last = new Date(state.lastOnlineValidateAtIso).getTime();
  if (Number.isFinite(last) && Date.now() - last < WEEK_MS) {
    return;
  }

  const machineId = getMachineId();
  try {
    const data = await validateLicenseOnline({
      license_key: state.license.license_key,
      machine_id: machineId,
    });
    if (data.valid && !data.expired) {
      await patchPersistedState({
        lastOnlineValidateAtIso: new Date().toISOString(),
      });
      return;
    }
    await patchPersistedState({
      onlineAccessBlockedReason:
        data.status === 'revoked'
          ? 'This license was revoked. Please contact support.'
          : 'This license is no longer valid on the server. Please renew or enter a new key.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isTransientLicenseApiFailure(msg)) {
      return;
    }
    await patchPersistedState({
      onlineAccessBlockedReason: msg,
    });
  }
}

export async function getLicenseStatus(): Promise<LicenseGetStatusResult> {
  const machineId = getMachineId();
  if (process.env.EDUKAN_UITEST_SKIP_LICENSE === '1') {
    return {
      mode: 'licensed',
      shouldShowOnboarding: false,
      canAccessApp: true,
      trialStartedAtIso: null,
      trialEndsAtIso: null,
      trialDaysRemaining: null,
      allowStartTrial: false,
      machineId,
      licenseServerMessage: null,
      licenseExpiryAtIso: null,
    };
  }

  void runWeeklyOnlineLicenseCheckIfDue().catch(() => undefined);

  const state = await readState();
  const now = Date.now();
  const maxObserved = state.maxObservedUnixMs;

  // Reject trial only when the local clock is moved backwards significantly.
  // That limits trial-extension abuse; paid licenses still validate on expiry/signature
  // so blocking them here caused false positives (NTP sync, sleep/wake, manual time tweaks).
  if (
    state.license &&
    typeof maxObserved === 'number' &&
    now + CLOCK_ROLLBACK_TOLERANCE_MS < maxObserved &&
    isTrialLicenseKey(state.license.license_key)
  ) {
    if (state.onlineAccessBlockedReason !== CLOCK_ROLLBACK_BLOCK_REASON) {
      await patchPersistedState({
        onlineAccessBlockedReason: CLOCK_ROLLBACK_BLOCK_REASON,
      });
    }

    return {
      mode: licenseModeFromKey(state.license),
      shouldShowOnboarding: true,
      canAccessApp: false,
      trialStartedAtIso: null,
      trialEndsAtIso: null,
      trialDaysRemaining: null,
      allowStartTrial: false,
      machineId,
      licenseServerMessage: CLOCK_ROLLBACK_BLOCK_REASON,
      licenseExpiryAtIso: state.license.expiry,
    };
  }

  // Keep a monotonic local high-water mark of observed wall clock time.
  // If user restores clock back to a valid value, clear only rollback block.
  if (typeof maxObserved !== 'number' || now > maxObserved) {
    await patchPersistedState({
      maxObservedUnixMs: now,
      ...(state.onlineAccessBlockedReason === CLOCK_ROLLBACK_BLOCK_REASON
        ? { onlineAccessBlockedReason: undefined }
        : {}),
    });
  } else if (state.onlineAccessBlockedReason === CLOCK_ROLLBACK_BLOCK_REASON) {
    await patchPersistedState({ onlineAccessBlockedReason: undefined });
  }

  if (state.onlineAccessBlockedReason) {
    return {
      mode: state.license ? licenseModeFromKey(state.license) : 'none',
      shouldShowOnboarding: true,
      canAccessApp: false,
      trialStartedAtIso: null,
      trialEndsAtIso: null,
      trialDaysRemaining: null,
      allowStartTrial: false,
      machineId,
      licenseServerMessage: state.onlineAccessBlockedReason,
      licenseExpiryAtIso: state.license?.expiry ?? null,
    };
  }

  if (!state.license) {
    return {
      mode: 'none',
      shouldShowOnboarding: true,
      canAccessApp: false,
      trialStartedAtIso: null,
      trialEndsAtIso: null,
      trialDaysRemaining: null,
      allowStartTrial: true,
      machineId,
      licenseServerMessage: null,
      licenseExpiryAtIso: null,
    };
  }

  const sig = await verifyLicenseRsaSignature(state.license);
  if (!sig.ok) {
    return {
      mode: 'none',
      shouldShowOnboarding: true,
      canAccessApp: false,
      trialStartedAtIso: null,
      trialEndsAtIso: null,
      trialDaysRemaining: null,
      allowStartTrial: true,
      machineId,
      licenseServerMessage: null,
      licenseExpiryAtIso: null,
    };
  }

  const fields = validateOfflineFields(state.license, machineId);
  if (!fields.valid) {
    const expired = new Date(state.license.expiry).getTime() <= Date.now();
    const wrongMachine = state.license.machine_id !== machineId;
    const mode = licenseModeFromKey(state.license);
    return {
      mode,
      shouldShowOnboarding: true,
      canAccessApp: false,
      trialStartedAtIso: null,
      trialEndsAtIso: expired ? state.license.expiry : null,
      trialDaysRemaining: expired ? 0 : null,
      /** After expiry, no second trial; different machine / bad file can start trial or use a new key. */
      allowStartTrial: !expired && wrongMachine,
      machineId,
      licenseServerMessage: fields.reason ?? null,
      licenseExpiryAtIso: state.license.expiry,
    };
  }

  const mode = licenseModeFromKey(state.license);
  const trialEndsAtIso = mode === 'trial' ? state.license.expiry : null;

  return {
    mode,
    shouldShowOnboarding: false,
    canAccessApp: true,
    trialStartedAtIso:
      mode === 'trial' ? state.license.issued_at ?? null : null,
    trialEndsAtIso,
    trialDaysRemaining:
      mode === 'trial' && trialEndsAtIso ? daysRemaining(trialEndsAtIso) : null,
    allowStartTrial: false,
    machineId,
    licenseServerMessage: null,
    licenseExpiryAtIso: state.license.expiry,
  };
}

export async function startTrialInternal(
  companyName: string
): Promise<LicenseStartTrialResult> {
  const state = await readState();
  const machineId = getMachineId();

  if (state.license) {
    const sig = await verifyLicenseRsaSignature(state.license);
    if (sig.ok) {
      const fields = validateOfflineFields(state.license, machineId);
      if (fields.valid) {
        return { success: false, error: 'A license is already active.' };
      }
    }
  }

  try {
    const license = await activateLicenseViaApi({
      license_key: getTrialLicenseKeyForMachine(machineId),
      machine_id: machineId,
      company_name: activationCompanyName(companyName),
    });
    const sig = await verifyLicenseRsaSignature(license);
    if (!sig.ok) {
      return {
        success: false,
        error: sig.error ?? 'Invalid trial license signature.',
      };
    }
    const fields = validateOfflineFields(license, machineId);
    if (!fields.valid) {
      return {
        success: false,
        error: fields.reason ?? 'Invalid trial license.',
      };
    }
    await writeLicense(license);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Trial activation failed.',
    };
  }
}

export async function submitLicenseKeyInternal(
  key: string,
  companyName: string
): Promise<LicenseSubmitKeyResult> {
  const trimmed = key.trim();
  if (trimmed.length < 4) {
    return { success: false, error: 'Please enter a valid license key.' };
  }
  const machineId = getMachineId();
  const existing = await readState();
  if (existing.license?.license_key === trimmed) {
    const sig = await verifyLicenseRsaSignature(existing.license);
    const fields = sig.ok
      ? validateOfflineFields(existing.license, machineId)
      : { valid: false };
    if (sig.ok && fields.valid) {
      return {
        success: false,
        error: 'This license is already active on this machine.',
      };
    }
  }
  try {
    const license = await activateLicenseViaApi({
      license_key: trimmed,
      machine_id: machineId,
      company_name: activationCompanyName(companyName),
    });
    const sig = await verifyLicenseRsaSignature(license);
    if (!sig.ok) {
      return {
        success: false,
        error: sig.error ?? 'Invalid license signature.',
      };
    }
    const fields = validateOfflineFields(license, machineId);
    if (!fields.valid) {
      return {
        success: false,
        error: fields.reason ?? 'Invalid license.',
      };
    }
    await writeLicense(license);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'License activation failed.',
    };
  }
}

export async function installLicenseFromJsonInternal(
  rawJson: string
): Promise<LicenseInstallJsonResult> {
  let parsed: SignedLicense;
  try {
    const trimmed = rawJson.replace(/^\uFEFF/, '').trim();
    parsed = JSON.parse(trimmed) as SignedLicense;
  } catch {
    return { success: false, error: 'Invalid JSON file.' };
  }

  const sig = await verifyLicenseRsaSignature(parsed);
  if (!sig.ok) {
    return { success: false, error: sig.error ?? 'Invalid license signature.' };
  }

  const fields = validateOfflineFields(parsed, getMachineId());
  if (!fields.valid) {
    return { success: false, error: fields.reason ?? 'Invalid license.' };
  }

  const existing = await readState();
  if (existing.license?.license_key === parsed.license_key) {
    const sig = await verifyLicenseRsaSignature(existing.license);
    const existingFields = sig.ok
      ? validateOfflineFields(existing.license, getMachineId())
      : { valid: false };
    if (sig.ok && existingFields.valid) {
      return {
        success: false,
        error: 'This license is already active on this machine.',
      };
    }
  }

  await writeLicense(parsed);
  return { success: true };
}
