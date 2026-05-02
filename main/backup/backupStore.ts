import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';

const FILE_NAME = 'edukan-backup-state.json';

export type BackupStatus = 'idle' | 'running' | 'success' | 'error' | 'offline';

export type BackupState = {
  version: 1;
  /** Hour of day (0-23) at which the daily backup runs. Default: 2 (2 AM). */
  backupHour: number;
  /** Minute (0-59) at which the daily backup runs. Default: 0. */
  backupMinute: number;
  /** ISO timestamp of the last successful backup upload. */
  lastSuccessAtIso: string | null;
  /** Date string (YYYY-MM-DD) of the last day a backup was attempted. */
  lastAttemptDateLocal: string | null;
  /** Last known status. */
  lastStatus: BackupStatus;
  /** Human-readable message for the last error (or null on success). */
  lastErrorMessage: string | null;
  /** The db file path currently open in the app. Populated via IPC. */
  currentDbPath: string | null;
  /** Company name extracted from AccountingSettings after DB opens. */
  currentCompanyName: string | null;
};

function getStatePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function defaultState(): BackupState {
  return {
    version: 1,
    backupHour: 2,
    backupMinute: 0,
    lastSuccessAtIso: null,
    lastAttemptDateLocal: null,
    lastStatus: 'idle',
    lastErrorMessage: null,
    currentDbPath: null,
    currentCompanyName: null,
  };
}

export async function readBackupState(): Promise<BackupState> {
  const p = getStatePath();
  if (!(await fs.pathExists(p))) {
    return defaultState();
  }
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const data = JSON.parse(raw) as BackupState;
    if (data?.version === 1) {
      return { ...defaultState(), ...data };
    }
  } catch {
    // ignore corrupt file
  }
  return defaultState();
}

export async function writeBackupState(data: BackupState): Promise<void> {
  const p = getStatePath();
  await fs.ensureDir(path.dirname(p));
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.move(tmp, p, { overwrite: true });
}

export async function patchBackupState(
  patch: Partial<BackupState>
): Promise<void> {
  const cur = await readBackupState();
  await writeBackupState({ ...cur, ...patch });
}

/** Returns today's local date as YYYY-MM-DD. */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
