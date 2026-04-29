import { app } from 'electron';
import path from 'path';

/**
 * Dev: repo root `public_key.pem`.
 * Packaged: `extraResources` → `process.resourcesPath/public_key.pem`.
 */
export function getPublicKeyPemPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'public_key.pem');
  }
  return path.join(__dirname, '..', '..', '..', '..', 'public_key.pem');
}
