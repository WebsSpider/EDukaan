/** Must match `pos-license-worker` and Electron `buildSignedPayloadString` field order. */
export async function signLicensePayload(
  params: {
    license_key: string;
    machine_id: string;
    company_name?: string;
    features?: string[];
    expiry: string;
    max_devices?: number;
  },
  privateKeyPem: string
): Promise<Record<string, unknown>> {
  /** Explicit fields so `JSON.stringify` never omits keys (verification must match byte-for-byte). */
  const payload = {
    license_key: params.license_key,
    machine_id: params.machine_id,
    company_name: params.company_name ?? '',
    features: params.features ?? [],
    expiry: params.expiry,
    max_devices: params.max_devices ?? 1,
  };
  const pemBody = privateKeyPem
    .replace(
      /-----BEGIN (?:RSA )?PRIVATE KEY-----|-----END (?:RSA )?PRIVATE KEY-----|\n/g,
      ''
    )
    .trim();
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    data
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  return { ...payload, signature };
}
