/** Paid (non-trial) keys: 16 chars, unambiguous alnum. Not `EDUKAN-TRIAL-*`. */
const PAID_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePaidLicenseKey16(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += PAID_KEY_ALPHABET[buf[i]! % PAID_KEY_ALPHABET.length]!;
  }
  return s;
}
