import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import type { LicenseMode, SignedLicense } from '../../utils/license/types';
import { isTrialLicenseKey } from './config';

const FILE_NAME = 'edukan-machine-license.json';

type PersistedV1 = {
  version: 1;
  mode: LicenseMode;
  trialStartedAt?: string;
  licenseKey?: string;
  license?: SignedLicense;
  /** ISO timestamp of last successful POST /validate (weekly check). */
  lastOnlineValidateAtIso?: string;
  /** When set, local license is ignored for access until user re-activates. */
  onlineAccessBlockedReason?: string;
};

function getStatePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function defaultState(): PersistedV1 {
  return { version: 1, mode: 'none' };
}

export async function readState(): Promise<PersistedV1> {
  const p = getStatePath();
  if (!(await fs.pathExists(p))) {
    return defaultState();
  }
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const data = JSON.parse(raw) as PersistedV1;
    if (
      data?.version === 1 &&
      (data.mode === 'none' ||
        data.mode === 'trial' ||
        data.mode === 'licensed')
    ) {
      return data;
    }
  } catch {
    // ignore
  }
  return defaultState();
}

export async function writeState(data: PersistedV1): Promise<void> {
  const p = getStatePath();
  await fs.ensureDir(path.dirname(p));
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.move(tmp, p, { overwrite: true });
}

export async function patchPersistedState(
  patch: Partial<PersistedV1>
): Promise<void> {
  const cur = await readState();
  await writeState({ ...cur, ...patch });
}

export async function writeLicense(license: SignedLicense): Promise<void> {
  const prev = await readState();
  const isTrial = isTrialLicenseKey(license.license_key);
  await writeState({
    ...prev,
    version: 1,
    mode: isTrial ? 'trial' : 'licensed',
    licenseKey: license.license_key,
    license,
    lastOnlineValidateAtIso: new Date().toISOString(),
    onlineAccessBlockedReason: undefined,
  });
}
