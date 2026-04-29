export interface Env {
	LICENSES: KVNamespace
	ACTIVATIONS: KVNamespace
	BACKUPS: KVNamespace
	LICENSE_PRIVATE_KEY: string
  }

  /** Must match Electron `EDUKAN_TRIAL_LICENSE_PREFIX` (default EDUKAN-TRIAL-). */
  const TRIAL_LICENSE_PREFIX = 'EDUKAN-TRIAL-'
  const TRIAL_DURATION_DAYS = 14

  const respond = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
	  status,
	  headers: { 'Content-Type': 'application/json' }
	})

  function isTrialLicenseKey(licenseKey: string): boolean {
	return licenseKey.startsWith(TRIAL_LICENSE_PREFIX)
  }

  function trialKeyForMachine(machineId: string): string {
	return `${TRIAL_LICENSE_PREFIX}${machineId}`
  }
  
  async function signLicense(payload: Record<string, unknown>, privateKeyPem: string) {
	const pemBody = privateKeyPem
	  .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
	const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
	const privateKey = await crypto.subtle.importKey(
	  'pkcs8', keyBytes,
	  { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
	  false, ['sign']
	)
	const data = new TextEncoder().encode(JSON.stringify(payload))
	const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data)
	const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
	return { ...payload, signature }
  }
  
  async function handleActivate(req: Request, env: Env) {
	const { license_key, machine_id, company_name: bodyCompanyName } = await req.json() as any
  
	if (!license_key || !machine_id)
		return respond(400, { error: 'license_key and machine_id required' })

	if (isTrialLicenseKey(license_key)) {
		if (license_key !== trialKeyForMachine(machine_id)) {
			return respond(400, { error: 'Trial license key does not match machine_id' })
		}
	}

	let license = await env.LICENSES.get(license_key, 'json') as any

	if (!license && isTrialLicenseKey(license_key)) {
		const expiry = new Date()
		expiry.setUTCDate(expiry.getUTCDate() + TRIAL_DURATION_DAYS)
		license = {
			license_key,
			company_name: bodyCompanyName.trim(),
			plan: 'trial',
			features: ['pos'],
			max_devices: 1,
			expiry: expiry.toISOString(),
			status: 'active'
		}
		await env.LICENSES.put(license_key, JSON.stringify(license))
	}

	if (!license) return respond(404, { error: 'License not found' })
	if (license.status !== 'active') return respond(403, { error: 'License is ' + license.status })
	if (new Date(license.expiry) < new Date()) return respond(403, { error: 'License expired' })
  
	// Check device limit
	const activationKey = `${license_key}:${machine_id}`
	const existingActivation = await env.ACTIVATIONS.get(activationKey, 'json') as any
  
	if (!existingActivation) {
	  // Count active devices
	  const list = await env.ACTIVATIONS.list({ prefix: `${license_key}:` })
	  if (list.keys.length >= license.max_devices)
		return respond(403, { error: 'Device limit reached' })
	}
  
	// Bind machine
	await env.ACTIVATIONS.put(activationKey, JSON.stringify({
	  license_key, machine_id,
	  activated_at: new Date().toISOString(),
	  last_seen_at: new Date().toISOString(),
	  is_active: true
	}))
  
	const resolvedCompanyName =
	  typeof bodyCompanyName === 'string' && bodyCompanyName.trim()
	    ? bodyCompanyName.trim()
	    : license.company_name

	const payload = {
	  license_key, machine_id,
	  company_name: resolvedCompanyName,
	  features: license.features,
	  expiry: license.expiry,
	  max_devices: license.max_devices,
	}
  
	const signed = await signLicense(payload, env.LICENSE_PRIVATE_KEY)
	return respond(200, { license: signed })
  }
  
  async function handleRenew(req: Request, env: Env) {
	const { license_key, machine_id, extend_days = 365 } = await req.json() as any
  
	if (!license_key || !machine_id)
	  return respond(400, { error: 'license_key and machine_id required' })
  
	const license = await env.LICENSES.get(license_key, 'json') as any
	if (!license) return respond(404, { error: 'License not found' })
	if (license.status === 'revoked') return respond(403, { error: 'License revoked' })
  
	const activationKey = `${license_key}:${machine_id}`
	const activation = await env.ACTIVATIONS.get(activationKey) as any
	if (!activation) return respond(403, { error: 'Machine not activated' })
  
	const newExpiry = new Date()
	newExpiry.setDate(newExpiry.getDate() + extend_days)
  
	await env.LICENSES.put(license_key, JSON.stringify({
	  ...license,
	  expiry: newExpiry.toISOString(),
	  status: 'active'
	}))
  
	const payload = {
	  license_key, machine_id,
	  company_name: license.company_name,
	  features: license.features,
	  expiry: newExpiry.toISOString(),
	  max_devices: license.max_devices,
	}
  
	const signed = await signLicense(payload, env.LICENSE_PRIVATE_KEY)
	return respond(200, { license: signed })
  }
  
  async function handleValidate(req: Request, env: Env) {
	const { license_key, machine_id } = await req.json() as any
  
	if (!license_key || !machine_id)
	  return respond(400, { error: 'license_key and machine_id required' })
  
	const license = await env.LICENSES.get(license_key, 'json') as any
	if (!license) return respond(404, { error: 'License not found' })
  
	const activationKey = `${license_key}:${machine_id}`
	const activation = await env.ACTIVATIONS.get(activationKey, 'json') as any
	if (!activation) return respond(403, { error: 'Machine not recognised' })
  
	// Update last_seen_at
	await env.ACTIVATIONS.put(activationKey, JSON.stringify({
	  ...activation,
	  last_seen_at: new Date().toISOString()
	}))
  
	const isExpired = new Date(license.expiry) < new Date()
	return respond(200, {
	  valid: license.status === 'active' && !isExpired,
	  status: license.status,
	  expired: isExpired,
	  expiry: license.expiry,
	  features: license.features,
	  company_name: license.company_name,
	})
  }
  
  export default {
	async fetch(req: Request, env: Env): Promise<Response> {
	  const url = new URL(req.url)
  
	  if (req.method === 'OPTIONS')
		return new Response(null, { headers: {
		  'Access-Control-Allow-Origin': '*',
		  'Access-Control-Allow-Methods': 'POST',
		  'Access-Control-Allow-Headers': 'Content-Type',
		}})
  
	  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' })
  
	  switch (url.pathname) {
		case '/activate':  return handleActivate(req, env)
		case '/renew':     return handleRenew(req, env)
		case '/validate':  return handleValidate(req, env)
		default:           return respond(404, { error: 'Not found' })
	  }
	}
  }