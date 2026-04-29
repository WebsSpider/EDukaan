import {
  clearSessionCookie,
  createSessionValue,
  getSessionCookie,
  resolveSessionSecret,
  setSessionCookie,
  verifySessionValue,
} from './auth';
import { listLicenseRows } from './licenses';
import { generatePaidLicenseKey16 } from './paidLicenseKey';
import { getPageHtml } from './page-html';
import { signLicensePayload } from './sign';

export interface Env {
  LICENSES: KVNamespace;
  ACTIVATIONS: KVNamespace;
  LICENSE_PRIVATE_KEY: string;
  DASHBOARD_PASSWORD: string;
  /** Optional; if unset, cookie HMAC uses `DASHBOARD_PASSWORD` (works with one secret). */
  SESSION_SECRET?: string;
  /** Optional; default EDUKAN-TRIAL- */
  TRIAL_LICENSE_PREFIX?: string;
}

const DEFAULT_TRIAL_PREFIX = 'EDUKAN-TRIAL-';

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...init?.headers,
    },
  });

const securityHeaders: HeadersInit = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function trialKeyForMachine(prefix: string, machineId: string): string {
  return `${prefix}${machineId.trim()}`;
}

function isTrialKey(key: string, prefix: string): boolean {
  return key.startsWith(prefix);
}

async function requireAuth(req: Request, env: Env): Promise<Response | null> {
  const raw = getSessionCookie(req);
  const secret = resolveSessionSecret(env);
  const ok = await verifySessionValue(raw, secret);
  if (!ok) {
    return json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    try {
      if (pathname === '/' && req.method === 'GET') {
        const html = getPageHtml();
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            ...securityHeaders,
          },
        });
      }

      if (pathname === '/api/session') {
        if (req.method !== 'GET') {
          return json({ error: 'Method not allowed' }, { status: 405 });
        }
        const raw = getSessionCookie(req);
        const secret = resolveSessionSecret(env);
        const ok = await verifySessionValue(raw, secret);
        return json({ ok }, { headers: securityHeaders });
      }

      if (pathname === '/api/login' && req.method === 'POST') {
        const body = (await req.json().catch(() => null)) as {
          password?: string;
        } | null;
        const pwd = body?.password ?? '';
        const expected = env.DASHBOARD_PASSWORD ?? '';
        if (!expected || pwd !== expected) {
          return json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
        }
        const sessionSecret = resolveSessionSecret(env);
        if (!sessionSecret.length) {
          return json(
            {
              ok: false,
              error:
                'Server misconfiguration: set DASHBOARD_PASSWORD and optionally SESSION_SECRET.',
            },
            { status: 500 }
          );
        }
        const token = await createSessionValue(sessionSecret);
        return json(
          { ok: true },
          {
            status: 200,
            headers: {
              'Set-Cookie': setSessionCookie(token, url.protocol === 'https:'),
              ...securityHeaders,
            },
          }
        );
      }

      if (pathname === '/api/logout' && req.method === 'POST') {
        return json(
          { ok: true },
          {
            headers: {
              'Set-Cookie': clearSessionCookie(url.protocol === 'https:'),
              ...securityHeaders,
            },
          }
        );
      }

      if (pathname === '/api/licenses' && req.method === 'GET') {
        const denied = await requireAuth(req, env);
        if (denied) return denied;

        const filter = (url.searchParams.get('filter') ?? 'all') as
          | 'all'
          | 'trial'
          | 'paid'
          | 'active'
          | 'expired';
        const search = url.searchParams.get('search') ?? '';
        const cursor = url.searchParams.get('cursor') ?? undefined;
        const trialPrefix =
          env.TRIAL_LICENSE_PREFIX?.trim() || DEFAULT_TRIAL_PREFIX;

        const result = await listLicenseRows(env.LICENSES, env.ACTIVATIONS, {
          filter: ['all', 'trial', 'paid', 'active', 'expired'].includes(filter)
            ? filter
            : 'all',
          search,
          cursor,
          trialPrefix,
        });

        return json(
          { ...result, trial_prefix: trialPrefix },
          { headers: securityHeaders }
        );
      }

      if (pathname === '/api/license-machine-ids' && req.method === 'GET') {
        const denied = await requireAuth(req, env);
        if (denied) return denied;

        const license_key = (url.searchParams.get('license_key') ?? '').trim();
        if (!license_key) {
          return json(
            { error: 'license_key is required' },
            { status: 400, headers: securityHeaders }
          );
        }

        const list = await env.ACTIVATIONS.list({ prefix: `${license_key}:` });
        const machineIds = Array.from(
          new Set(
            list.keys
              .map((k) => k.name.slice(`${license_key}:`.length).trim())
              .filter((v) => v.length > 0)
          )
        ).sort();

        return json(
          {
            machine_ids: machineIds,
            inferred_machine_id: machineIds.length === 1 ? machineIds[0] : '',
          },
          { headers: securityHeaders }
        );
      }

      if (pathname === '/api/licenses/create' && req.method === 'POST') {
        const denied = await requireAuth(req, env);
        if (denied) return denied;

        const body = (await req.json().catch(() => null)) as {
          company_name?: string;
          expiry_days?: number;
          max_devices?: number;
        } | null;

        const company_name = (body?.company_name ?? '').trim() || 'Customer';
        const expiry_days = Math.min(
          3650,
          Math.max(1, Number(body?.expiry_days) || 365)
        );
        const max_devices = Math.min(
          999,
          Math.max(1, Number(body?.max_devices) || 1)
        );

        let license_key = '';
        for (let a = 0; a < 24; a++) {
          license_key = generatePaidLicenseKey16();
          const exists = await env.LICENSES.get(license_key);
          if (!exists) break;
        }
        const collision = await env.LICENSES.get(license_key);
        if (collision) {
          return json(
            { error: 'Could not allocate a unique license key; try again.' },
            { status: 503, headers: securityHeaders }
          );
        }

        const expiry = new Date();
        expiry.setUTCDate(expiry.getUTCDate() + expiry_days);
        const record = {
          license_key,
          company_name,
          plan: 'paid',
          features: ['pos'],
          max_devices,
          expiry: expiry.toISOString(),
          status: 'active',
        };
        await env.LICENSES.put(license_key, JSON.stringify(record));
        return json(
          { license_key, license: record },
          { headers: securityHeaders }
        );
      }

      if (pathname === '/api/sign-license-file' && req.method === 'POST') {
        const denied = await requireAuth(req, env);
        if (denied) return denied;

        const body = (await req.json().catch(() => null)) as {
          license_key?: string;
          machine_id?: string;
          company_name?: string;
        } | null;

        const license_key = body?.license_key?.trim() ?? '';
        let machine_id = body?.machine_id?.trim() ?? '';
        const trialPrefix =
          env.TRIAL_LICENSE_PREFIX?.trim() || DEFAULT_TRIAL_PREFIX;

        if (isTrialKey(license_key, trialPrefix) && !machine_id) {
          machine_id = license_key.slice(trialPrefix.length).trim();
        }

        if (!license_key || !machine_id) {
          return json(
            { error: 'license_key required; machine_id required for paid keys' },
            { status: 400 }
          );
        }

        if (isTrialKey(license_key, trialPrefix)) {
          if (license_key !== trialKeyForMachine(trialPrefix, machine_id)) {
            return json(
              { error: 'Trial license key does not match this machine_id' },
              { status: 400 }
            );
          }
        }

        let license = (await env.LICENSES.get(license_key, 'json')) as Record<
          string,
          unknown
        > | null;

        if (
          !license &&
          isTrialKey(license_key, trialPrefix) &&
          license_key === trialKeyForMachine(trialPrefix, machine_id)
        ) {
          const expiry = new Date();
          expiry.setUTCDate(expiry.getUTCDate() + 14);
          license = {
            license_key,
            company_name:
              typeof body?.company_name === 'string'
                ? body.company_name.trim()
                : '',
            plan: 'trial',
            features: ['pos'],
            max_devices: 1,
            expiry: expiry.toISOString(),
            status: 'active',
          };
        }

        if (!license) {
          return json({ error: 'License not found in KV' }, { status: 404 });
        }

        const status = String(license.status ?? '');
        if (status !== 'active') {
          return json({ error: 'License is not active' }, { status: 403 });
        }
        const exp = String(license.expiry ?? '');
        if (!exp || new Date(exp).getTime() <= Date.now()) {
          return json({ error: 'License expired' }, { status: 403 });
        }

        const companyFromKv = String(license.company_name ?? '');
        const companyOverride =
          typeof body?.company_name === 'string'
            ? body.company_name.trim()
            : '';
        const company_name = companyOverride || companyFromKv;
        const features = Array.isArray(license.features)
          ? (license.features as string[])
          : [];
        const max_devices = Number(license.max_devices ?? 1);

        const payload = {
          license_key,
          machine_id,
          company_name,
          features,
          expiry: exp,
          max_devices,
        };

        const signed = await signLicensePayload(
          payload,
          env.LICENSE_PRIVATE_KEY
        );
        const filename = `license-${license_key.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`;
        return new Response(JSON.stringify(signed, null, 2), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
            ...securityHeaders,
          },
        });
      }

      return json({ error: 'Not found' }, { status: 404, headers: securityHeaders });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, { status: 500, headers: securityHeaders });
    }
  },
};
