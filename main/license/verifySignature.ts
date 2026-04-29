import { createPublicKey, createVerify } from 'crypto';
import fs from 'fs-extra';
import type { SignedLicense } from '../../utils/license/types';
import { getPublicKeyPemPath } from './publicKeyPath';

let publicKeyPemCache: string | null = null;

async function loadPublicKeyPem(): Promise<string> {
  if (publicKeyPemCache) {
    return publicKeyPemCache;
  }
  const p = getPublicKeyPemPath();
  if (!(await fs.pathExists(p))) {
    throw new Error(`License public key not found at ${p}`);
  }
  publicKeyPemCache = await fs.readFile(p, 'utf-8');
  return publicKeyPemCache;
}

/**
 * Must match worker `signLicense`: JSON.stringify(payload) before signature,
 * where payload has keys in this order (omit undefined, like JSON.stringify).
 */
export function buildSignedPayloadString(license: SignedLicense): string {
  const payload: Record<string, unknown> = {
    license_key: license.license_key,
    machine_id: license.machine_id,
    company_name: license.company_name ?? '',
    features: license.features ?? [],
    expiry: license.expiry,
    max_devices: license.max_devices ?? 1,
  };
  return JSON.stringify(payload);
}

export async function verifyLicenseRsaSignature(
  license: SignedLicense
): Promise<{ ok: boolean; error?: string }> {
  const sigB64 = license.signature?.trim();
  if (!sigB64) {
    return { ok: false, error: 'License is not signed.' };
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(sigB64, 'base64');
  } catch {
    return { ok: false, error: 'Invalid signature encoding.' };
  }

  const message = buildSignedPayloadString(license);
  const pem = await loadPublicKeyPem();
  const key = createPublicKey(pem);
  const verify = createVerify('RSA-SHA256');
  verify.update(message, 'utf8');
  verify.end();

  const ok = verify.verify(key, signature);
  return ok ? { ok: true } : { ok: false, error: 'Invalid license signature.' };
}
