import crypto from 'crypto';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';

const MACHINE_ID_FILE = 'edukan-machine-id.json';
const LICENSE_STATE_FILE = 'edukan-machine-license.json';

let machineIdCache: string | null = null;

function getUserDataDir(): string | null {
  try {
    // In Electron main process this is available synchronously.
    return app.getPath('userData');
  } catch {
    return null;
  }
}

function getMachineIdFilePath(): string | null {
  const userData = getUserDataDir();
  if (!userData) return null;
  return path.join(userData, MACHINE_ID_FILE);
}

function getLicenseStateFilePath(): string | null {
  const userData = getUserDataDir();
  if (!userData) return null;
  return path.join(userData, LICENSE_STATE_FILE);
}

function readJsonIfExistsSync(p: string | null): unknown | null {
  if (!p) return null;
  try {
    if (!fs.existsSync(p)) return null;
    return fs.readJsonSync(p);
  } catch {
    return null;
  }
}

function isHexSha256(s: unknown): s is string {
  return typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s.trim());
}

function networkFingerprint(): string {
  const interfaces = os.networkInterfaces();
  const macs: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const item of list ?? []) {
      if (!item.mac || item.mac === '00:00:00:00:00:00') {
        continue;
      }
      macs.push(item.mac);
    }
  }
  return macs.sort().join('|');
}

export function getMachineId(): string {
  if (machineIdCache) return machineIdCache;

  // 1) Prefer persisted machine id (stabilizes over network/MAC changes).
  const machineIdPath = getMachineIdFilePath();
  const persisted = readJsonIfExistsSync(machineIdPath) as {
    machineId?: string;
  } | null;
  if (isHexSha256(persisted?.machineId)) {
    machineIdCache = persisted.machineId.trim();
    return machineIdCache;
  }

  // 2) If an older license is already saved, seed machine id from it so
  //    existing trials/licenses don't suddenly fail after this change.
  const legacyStatePath = getLicenseStateFilePath();
  const legacyState = readJsonIfExistsSync(legacyStatePath) as {
    license?: { machine_id?: string };
  } | null;
  const fromLegacyLicense = legacyState?.license?.machine_id;
  if (isHexSha256(fromLegacyLicense)) {
    machineIdCache = fromLegacyLicense.trim();
    if (machineIdPath) {
      try {
        fs.writeJsonSync(
          machineIdPath,
          { machineId: machineIdCache },
          { spaces: 2 }
        );
      } catch {
        // ignore write errors; still return seeded id
      }
    }
    return machineIdCache;
  }

  // 3) First run: compute from system fingerprint and persist.
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()?.[0]?.model ?? '',
    networkFingerprint(),
  ].join('::');

  machineIdCache = crypto.createHash('sha256').update(raw).digest('hex');

  if (machineIdPath) {
    try {
      fs.writeJsonSync(
        machineIdPath,
        { machineId: machineIdCache },
        { spaces: 2 }
      );
    } catch {
      // ignore write errors; machine id will be stable for this session
    }
  }

  return machineIdCache;
}
