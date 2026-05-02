/**
 * Backup service: orchestrates copying, compressing, uploading, and pruning.
 *
 * Pipeline:
 *   1. Copy the SQLite DB to a temp file (safe hot-copy while DB is open).
 *   2. Gzip-compress the copy.
 *   3. Upload to BackBlaze B2: key = <CompanyName>/backup-TIMESTAMP.db.gz
 *   4. Delete objects with the same prefix that are older than 7 days.
 *   5. Record success / failure in backup state.
 *
 * Licensing: only runs when the signed license includes the "backup" feature.
 */

import zlib from 'zlib';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { readState } from '../license/licenseStore';
import {
  patchBackupState,
  readBackupState,
  todayLocal,
} from './backupStore';
import {
  deleteObject,
  isB2Configured,
  listObjects,
  uploadObject,
} from './b2Api';

const RETENTION_DAYS = 7;

// ---------------------------------------------------------------------------
// License feature check
// ---------------------------------------------------------------------------

export async function hasBackupFeature(): Promise<boolean> {
  const state = await readState();
  const features = state.license?.features;
  if (!Array.isArray(features)) {
    return false;
  }
  return features.includes('backup');
}

// ---------------------------------------------------------------------------
// Compression helpers
// ---------------------------------------------------------------------------

function gzipFile(src: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(src);
    const output = fs.createWriteStream(dest);
    const gz = zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION });

    input.on('error', reject);
    output.on('error', reject);
    output.on('close', resolve);

    input.pipe(gz).pipe(output);
  });
}

function gunzipBuffer(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buf, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// ---------------------------------------------------------------------------
// Main backup pipeline
// ---------------------------------------------------------------------------

/**
 * Creates a compressed backup of the current company DB and uploads it to
 * BackBlaze B2.  Returns an error message string on failure, or null on success.
 */
export async function createAndUploadBackup(): Promise<string | null> {
  const state = await readBackupState();
  const dbPath = state.currentDbPath;
  const companyName = state.currentCompanyName ?? 'Unknown Company';

  if (!dbPath) {
    return 'No database is currently open. Open a company first.';
  }

  if (!isB2Configured()) {
    return 'BackBlaze B2 credentials are not configured.';
  }

  const licensed = await hasBackupFeature();
  if (!licensed) {
    return 'The current license does not include the backup feature.';
  }

  const today = todayLocal();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .slice(0, 19);

  // Sanitise company name so it's safe as an S3 key prefix
  const safeCompany = companyName.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'Company';
  const fileName = `backup-${timestamp}.db.gz`;
  const objectKey = `${safeCompany}/${fileName}`;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edukan-backup-'));
  const tmpDbCopy = path.join(tmpDir, 'snapshot.db');
  const tmpGz = path.join(tmpDir, fileName);

  try {
    await patchBackupState({ lastStatus: 'running', lastErrorMessage: null });

    // 1. Copy DB (WAL-mode safe hot copy)
    await fs.copyFile(dbPath, tmpDbCopy);

    // 2. Compress
    await gzipFile(tmpDbCopy, tmpGz);
    const fileBuffer = await fs.readFile(tmpGz);

    // 3. Upload to B2
    await uploadObject({
      key: objectKey,
      body: fileBuffer,
      contentType: 'application/gzip',
    });

    // 4. Prune: delete backups older than RETENTION_DAYS
    await pruneOldBackups(`${safeCompany}/`);

    // 5. Record success
    await patchBackupState({
      lastStatus: 'success',
      lastSuccessAtIso: new Date().toISOString(),
      lastAttemptDateLocal: today,
      lastErrorMessage: null,
    });

    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isOffline =
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|fetch failed|getaddrinfo/i.test(
        msg
      );

    await patchBackupState({
      lastStatus: isOffline ? 'offline' : 'error',
      lastAttemptDateLocal: today,
      lastErrorMessage: msg,
    });

    return msg;
  } finally {
    await fs.remove(tmpDir).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Prune old backups
// ---------------------------------------------------------------------------

async function pruneOldBackups(prefix: string): Promise<void> {
  const objects = await listObjects(prefix);
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const obj of objects) {
    if (!obj.lastModified) {
      continue;
    }
    if (obj.lastModified.getTime() < cutoff) {
      await deleteObject(obj.key).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Restore helper
// ---------------------------------------------------------------------------

/**
 * Decompresses a .db.gz backup file and writes the raw SQLite DB to `destPath`.
 */
export async function restoreBackupFile(
  backupGzPath: string,
  destPath: string
): Promise<void> {
  const compressed = await fs.readFile(backupGzPath);
  const raw = await gunzipBuffer(compressed);
  await fs.ensureDir(path.dirname(destPath));
  await fs.writeFile(destPath, raw);
}
