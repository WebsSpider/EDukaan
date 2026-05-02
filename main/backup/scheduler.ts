/**
 * Backup scheduler: checks once per hour whether the configured backup hour
 * has arrived and no backup has run today.  Sends a toast to the renderer on
 * offline failure.
 */

import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../utils/messages';
import { createAndUploadBackup, hasBackupFeature } from './backupService';
import { patchBackupState, readBackupState, todayLocal } from './backupStore';
import { isB2Configured } from './b2Api';

const CHECK_INTERVAL_MS = 60 * 1000; // every minute
let _timer: ReturnType<typeof setInterval> | null = null;
let _getWindow: (() => BrowserWindow | null) | null = null;

/**
 * Start the hourly scheduler.
 * `getWindow` is called lazily so that a window reference is never stale.
 */
export function startBackupScheduler(
  getWindow: () => BrowserWindow | null
): void {
  _getWindow = getWindow;

  if (_timer) {
    clearInterval(_timer);
  }

  _timer = setInterval(() => {
    void checkAndRunBackup();
  }, CHECK_INTERVAL_MS);

  // Also run the check shortly after startup in case the app was restarted
  // after the configured hour.
  setTimeout(() => {
    void checkAndRunBackup();
  }, 30_000);
}

export function stopBackupScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function checkAndRunBackup(): Promise<void> {
  if (!isB2Configured()) {
    return;
  }

  const licensed = await hasBackupFeature();
  if (!licensed) {
    return;
  }

  const state = await readBackupState();
  if (!state.currentDbPath) {
    return;
  }

  const currentHour = new Date().getHours();
  const currentMinute = new Date().getMinutes();
  const today = todayLocal();

  // Only run if we're at the configured hour:minute and haven't run today yet.
  if (
    currentHour !== state.backupHour ||
    currentMinute !== (state.backupMinute ?? 0) ||
    state.lastAttemptDateLocal === today
  ) {
    return;
  }

  // Mark attempt so parallel checks don't double-fire
  await patchBackupState({ lastAttemptDateLocal: today });

  const err = await createAndUploadBackup();

  if (err) {
    const updatedState = await readBackupState();
    const isOffline = updatedState.lastStatus === 'offline';

    sendToastToRenderer(
      isOffline
        ? `Backup skipped: device is offline. It will retry tomorrow at ${formatTime(state.backupHour, state.backupMinute ?? 0)}.`
        : `Backup failed: ${err}`,
      isOffline ? 'warning' : 'error'
    );
  }
}

function sendToastToRenderer(
  message: string,
  type: 'warning' | 'error'
): void {
  const win = _getWindow?.();
  if (!win || win.isDestroyed()) {
    return;
  }
  win.webContents.send(IPC_CHANNELS.BACKUP_TOAST, { message, type });
}

function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = String(minute).padStart(2, '0');
  return `${h}:${m} ${period}`;
}
