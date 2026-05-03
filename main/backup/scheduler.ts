/**
 * Backup scheduler: checks once per minute whether the configured backup time
 * has arrived and no backup has run today.  Sends toasts to the renderer for
 * all backup lifecycle events (running, success, offline, error).
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
 * Start the backup scheduler.
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
// Shared run function — used by both the scheduler and the manual IPC handler
// so both paths are identical.
// ---------------------------------------------------------------------------

/**
 * Runs the full backup pipeline, sends user-visible toasts for every outcome,
 * and returns `{ ok, error }` so callers (IPC handler) can relay the result.
 */
export async function runBackupWithNotifications(): Promise<{
  ok: boolean;
  error?: string;
}> {
  sendToastToRenderer('Backup is running…', 'info');

  const err = await createAndUploadBackup();

  if (err) {
    const updatedState = await readBackupState();
    const isOffline = updatedState.lastStatus === 'offline';
    const state = await readBackupState();

    sendToastToRenderer(
      isOffline
        ? `Backup skipped: device is offline. It will retry tomorrow at ${formatTime(state.backupHour, state.backupMinute ?? 0)}.`
        : `Backup failed: ${err}`,
      isOffline ? 'warning' : 'error'
    );

    return { ok: false, error: err };
  }

  sendToastToRenderer('Backup completed successfully!', 'success');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Scheduler tick
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

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const today = todayLocal();

  // Convert both times to minutes-since-midnight for a simple >= comparison.
  // Using >= (not ===) so a missed tick (timer drift) doesn't skip the backup —
  // the check fires on the next tick and still runs as long as it hasn't yet
  // run today.
  const nowMinutes = currentHour * 60 + currentMinute;
  const scheduledMinutes = state.backupHour * 60 + (state.backupMinute ?? 0);

  if (nowMinutes < scheduledMinutes || state.lastAttemptDateLocal === today) {
    return;
  }

  // Mark attempt immediately so parallel ticks don't double-fire.
  await patchBackupState({ lastAttemptDateLocal: today });

  // Delegate to the shared function — identical to what "Backup Now" runs.
  await runBackupWithNotifications();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendToastToRenderer(
  message: string,
  type: 'info' | 'warning' | 'error' | 'success'
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
