import fetch from 'node-fetch';
import type { SignedLicense } from '../../utils/license/types';
import { getLicenseApiBaseUrl } from './config';

type ActivateResponse = {
  error?: string;
  license?: SignedLicense;
};

export type ValidateResponse = {
  error?: string;
  valid?: boolean;
  status?: string;
  expired?: boolean;
  expiry?: string;
  features?: string[];
  company_name?: string;
};

type RenewResponse = {
  error?: string;
  license?: SignedLicense;
};

async function postJson<T>(pathname: string, payload: unknown): Promise<T> {
  const base = getLicenseApiBaseUrl();
  const url = `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as T;
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ??
        `License API request failed (${res.status})`
    );
  }
  return data;
}

/** Binds machine and returns signed license JSON (offline file). */
export async function activateLicenseViaApi(payload: {
  license_key: string;
  machine_id: string;
  company_name: string;
}): Promise<SignedLicense> {
  const data = await postJson<ActivateResponse>('/activate', payload);
  if (!data.license) {
    throw new Error(data.error ?? 'Activation returned no license.');
  }
  return data.license;
}

/** Server-side status check (no signature in response). */
export async function validateLicenseOnline(payload: {
  license_key: string;
  machine_id: string;
}): Promise<ValidateResponse> {
  return await postJson<ValidateResponse>('/validate', payload);
}

export async function renewLicenseViaApi(payload: {
  license_key: string;
  machine_id: string;
  extend_days?: number;
}): Promise<SignedLicense> {
  const data = await postJson<RenewResponse>('/renew', payload);
  if (!data.license) {
    throw new Error(data.error ?? 'Renew returned no license.');
  }
  return data.license;
}
