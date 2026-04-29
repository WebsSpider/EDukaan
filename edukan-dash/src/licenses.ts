/** Must match Electron / license worker default. */
const DEFAULT_TRIAL_PREFIX = 'EDUKAN-TRIAL-';

export type LicenseRow = {
  license_key: string;
  company_name: string;
  plan: string;
  status: string;
  expiry: string;
  is_trial: boolean;
  is_expired: boolean;
  max_devices: number;
  features: string[];
  activation_count: number;
};

type KvLicense = {
  license_key?: string;
  company_name?: string;
  plan?: string;
  status?: string;
  expiry?: string;
  max_devices?: number;
  features?: string[];
};

export async function countActivations(
  activations: KVNamespace,
  licenseKey: string
): Promise<number> {
  const list = await activations.list({ prefix: `${licenseKey}:` });
  return list.keys.length;
}

export async function listLicenseRows(
  licenses: KVNamespace,
  activations: KVNamespace,
  opts: {
    filter: 'all' | 'trial' | 'paid' | 'active' | 'expired';
    search: string;
    cursor?: string;
    trialPrefix?: string;
  }
): Promise<{ rows: LicenseRow[]; cursor?: string; complete: boolean }> {
  const trialPrefix = opts.trialPrefix?.trim() || DEFAULT_TRIAL_PREFIX;
  const list = await licenses.list({ limit: 200, cursor: opts.cursor });
  const search = opts.search.trim().toLowerCase();
  const rows: LicenseRow[] = [];

  for (const k of list.keys) {
    const name = k.name;
    const raw = await licenses.get(name, 'json');
    if (!raw || typeof raw !== 'object') continue;
    const lic = raw as KvLicense;
    const company = String(lic.company_name ?? '');
    const plan = String(lic.plan ?? (name.startsWith(trialPrefix) ? 'trial' : 'paid'));
    const isTrial = name.startsWith(trialPrefix) || plan === 'trial';
    const expiryIso = lic.expiry ?? '';
    const expired =
      !expiryIso || Number.isNaN(new Date(expiryIso).getTime())
        ? true
        : new Date(expiryIso).getTime() <= Date.now();
    const status = String(lic.status ?? 'unknown');

    if (opts.filter === 'trial' && !isTrial) continue;
    if (opts.filter === 'paid' && isTrial) continue;
    if (opts.filter === 'active' && (expired || status !== 'active')) continue;
    if (opts.filter === 'expired' && !expired) continue;

    if (search) {
      const hay = `${name} ${company} ${plan} ${status}`.toLowerCase();
      if (!hay.includes(search)) continue;
    }

    const activation_count = await countActivations(activations, name);
    rows.push({
      license_key: name,
      company_name: company,
      plan,
      status,
      expiry: expiryIso,
      is_trial: isTrial,
      is_expired: expired,
      max_devices: Number(lic.max_devices ?? 1),
      features: Array.isArray(lic.features) ? lic.features : [],
      activation_count,
    });
  }

  rows.sort((a, b) => a.license_key.localeCompare(b.license_key));

  return {
    rows,
    cursor: list.list_complete ? undefined : list.cursor,
    complete: list.list_complete,
  };
}
