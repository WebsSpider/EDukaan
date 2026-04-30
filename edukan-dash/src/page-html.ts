/** Single-file responsive dashboard (no bundler for assets). */
export function getPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>E Dukaan — License dashboard</title>
  <style>
    :root {
      --bg: #0f1419;
      --surface: #1a2332;
      --border: #2d3a4d;
      --text: #e7ecf3;
      --muted: #8b9cb3;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --danger: #ef4444;
      --success: #22c55e;
      --radius: 10px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
    }
    .app { max-width: 1200px; margin: 0 auto; padding: 1rem; padding-bottom: 3rem; }
    header.top {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem;
      justify-content: space-between; margin-bottom: 1.25rem;
    }
    h1 { font-size: 1.15rem; font-weight: 600; margin: 0; }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
    }
    select, input[type="search"], input[type="text"], input[type="password"] {
      background: var(--surface); border: 1px solid var(--border); color: var(--text);
      border-radius: var(--radius); padding: 0.5rem 0.65rem; font-size: 0.9rem;
      min-width: 0;
    }
    input[type="search"] { min-width: 8rem; flex: 1; max-width: 16rem; }
    button {
      background: var(--accent); color: white; border: none; border-radius: var(--radius);
      padding: 0.5rem 0.85rem; font-size: 0.875rem; font-weight: 500; cursor: pointer;
    }
    button:hover { background: var(--accent-hover); }
    button.secondary { background: var(--surface); border: 1px solid var(--border); color: var(--text); }
    button.secondary:hover { border-color: var(--muted); }
    button.small { padding: 0.35rem 0.55rem; font-size: 0.8rem; }
    .badge {
      display: inline-block; padding: 0.15rem 0.45rem; border-radius: 6px;
      font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
    }
    .badge-trial { background: #422006; color: #fdba74; }
    .badge-paid { background: #14532d; color: #86efac; }
    .badge-expired { background: #450a0a; color: #fca5a5; }
    .badge-active { background: #0c4a6e; color: #7dd3fc; }
    .table-wrap {
      overflow-x: auto; -webkit-overflow-scrolling: touch;
      border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface);
      display: none;
    }
    @media (min-width: 768px) { .table-wrap { display: block; } }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: ui-monospace, monospace; font-size: 0.78rem; word-break: break-all; }
    .cards { display: flex; flex-direction: column; gap: 0.75rem; }
    @media (min-width: 768px) { .cards { display: none; } }
    .card {
      border: 1px solid var(--border); border-radius: var(--radius); padding: 0.85rem;
      background: var(--surface);
    }
    .card h3 { margin: 0 0 0.5rem; font-size: 0.9rem; word-break: break-all; }
    .card .meta { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem; }
    .card .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.65rem; }
    .login-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 100;
    }
    .login-modal {
      background: var(--surface); border: 1px solid var(--border); border-radius: calc(var(--radius) + 4px);
      padding: 1.5rem; width: 100%; max-width: 380px;
    }
    .login-modal h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
    .login-modal p { margin: 0 0 1rem; color: var(--muted); font-size: 0.9rem; }
    .login-modal label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.25rem; }
    .login-modal input { width: 100%; margin-bottom: 1rem; }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 90;
      display: flex; align-items: flex-end; justify-content: center; padding: 0;
    }
    @media (min-width: 480px) {
      .modal-backdrop { align-items: center; padding: 1rem; }
    }
    .modal {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius) var(--radius) 0 0; width: 100%; max-width: 440px;
      max-height: 90vh; overflow-y: auto; padding: 1.25rem;
    }
    @media (min-width: 480px) { .modal { border-radius: var(--radius); } }
    .modal h3 { margin: 0 0 0.75rem; font-size: 1rem; }
    .win-key {
      font-family: ui-monospace, monospace; font-size: clamp(0.85rem, 3.5vw, 1rem);
      letter-spacing: 0.06em; text-align: center; padding: 1rem; background: var(--bg);
      border: 1px dashed var(--border); border-radius: var(--radius); margin: 0.75rem 0;
      line-height: 1.6; user-select: all; word-break: break-all;
    }
    .row-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .muted { color: var(--muted); font-size: 0.8rem; }
    .err { color: #fca5a5; font-size: 0.85rem; margin-top: 0.5rem; }
    .load-more-wrap { margin-top: 1rem; text-align: center; }
    #main-ui.hidden { display: none !important; }
    /* [hidden] must win over .login-backdrop { display:flex } — otherwise the login overlay stays visible */
    #login-shell[hidden],
    #modal-shell[hidden] {
      display: none !important;
    }
  </style>
</head>
<body>
  <div id="login-shell" class="login-backdrop" hidden>
    <div class="login-modal">
      <h2>Sign in</h2>
      <p>License dashboard — authorized access only.</p>
      <form id="login-form">
        <label for="pw">Password</label>
        <input id="pw" type="password" autocomplete="current-password" required/>
        <button type="submit" style="width:100%">Continue</button>
        <div id="login-err" class="err" hidden></div>
      </form>
    </div>
  </div>

  <div id="main-ui" class="app hidden">
    <header class="top">
      <h1>Licenses</h1>
      <div class="toolbar">
        <select id="filter">
          <option value="all">All</option>
          <option value="trial">Trial</option>
          <option value="paid">Paid (non-trial)</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
        </select>
        <input id="search" type="search" placeholder="Search key, company…" />
        <button type="button" class="secondary" id="create-lic">Create paid license</button>
        <button type="button" class="secondary" id="refresh">Refresh</button>
        <button type="button" class="secondary" id="logout">Log out</button>
      </div>
    </header>

    <p class="muted" id="stats"></p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Key</th><th>Company</th><th>Type</th><th>Status</th><th>Expiry</th><th>Devices</th><th></th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
    <div class="cards" id="cards"></div>
    <div class="load-more-wrap"><button type="button" class="secondary" id="more" hidden>Load more</button></div>
  </div>

  <div id="modal-shell" class="modal-backdrop" hidden>
    <div class="modal">
      <h3 id="modal-title"></h3>
      <div id="modal-body"></div>
      <div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" class="secondary" id="modal-close">Close</button>
      </div>
    </div>
  </div>

  <script>
(function () {
  const $ = (s) => document.querySelector(s);
  const loginShell = $('#login-shell');
  const mainUi = $('#main-ui');
  const loginForm = $('#login-form');
  const loginErr = $('#login-err');
  const tbody = $('#tbody');
  const cards = $('#cards');
  const filterEl = $('#filter');
  const searchEl = $('#search');
  const statsEl = $('#stats');
  const moreBtn = $('#more');
  const modalShell = $('#modal-shell');
  const modalTitle = $('#modal-title');
  const modalBody = $('#modal-body');

  let listCursor = '';
  let listComplete = true;
  let allRows = [];
  let trialPrefix = 'EDUKAN-TRIAL-';

  function getCompanyOptionsHtml(selectedCompany) {
    const companies = Array.from(
      new Set(
        allRows
          .map((row) => (row.company_name || '').trim())
          .filter((name) => !!name)
      )
    ).sort((a, b) => a.localeCompare(b));
    if (!companies.length) {
      companies.push('Customer');
    }
    if (selectedCompany && !companies.includes(selectedCompany)) {
      companies.unshift(selectedCompany);
    }
    return companies
      .map((name) => {
        const selected = name === selectedCompany ? ' selected' : '';
        return '<option value="' + esc(name) + '"' + selected + '>' + esc(name) + '</option>';
      })
      .join('');
  }

  async function inferMachineIdByCompany(companyName, fallbackLicenseKey) {
    const normalizedCompany = (companyName || '').trim();
    if (!normalizedCompany) {
      return '';
    }

    const candidates = allRows
      .filter(
        (row) =>
          (row.company_name || '').trim() === normalizedCompany &&
          row.activation_count > 0 &&
          row.license_key !== fallbackLicenseKey
      )
      .map((row) => row.license_key);

    for (const key of candidates) {
      try {
        const infoRes = await api(
          '/api/license-machine-ids?license_key=' + encodeURIComponent(key),
          { method: 'GET' }
        );
        if (!infoRes.ok) {
          continue;
        }
        const info = await infoRes.json().catch(() => ({}));
        if (typeof info.inferred_machine_id === 'string' && info.inferred_machine_id.trim()) {
          return info.inferred_machine_id.trim();
        }
        if (Array.isArray(info.machine_ids) && info.machine_ids.length === 1) {
          return String(info.machine_ids[0] || '').trim();
        }
      } catch {
        // Ignore candidate failures and keep searching.
      }
    }

    return '';
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatWinKey(raw) {
    const clean = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!clean) return '';
    const chunks = [];
    for (let i = 0; i < clean.length; i += 5) chunks.push(clean.slice(i, i + 5));
    return chunks.join('-');
  }

  async function api(path, opt) {
    const r = await fetch(path, Object.assign({
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    }, opt));
    return r;
  }

  async function checkSession() {
    const r = await api('/api/session', { method: 'GET' });
    const j = await r.json();
    return j.ok === true;
  }

  function showLogin() {
    loginShell.hidden = false;
    mainUi.classList.add('hidden');
  }

  function showApp() {
    loginShell.hidden = true;
    mainUi.classList.remove('hidden');
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErr.hidden = true;
    const password = $('#pw').value;
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      loginErr.textContent = j.error || 'Login failed';
      loginErr.hidden = false;
      return;
    }
    $('#pw').value = '';
    showApp();
    await loadAllPages(true);
  });

  $('#logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', body: '{}' });
    allRows = [];
    showLogin();
  });

  $('#refresh').addEventListener('click', () => loadAllPages(true));

  filterEl.addEventListener('change', () => loadAllPages(true));
  let searchTimer;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadAllPages(true), 320);
  });

  async function loadAllPages(reset) {
    if (reset) {
      listCursor = '';
      listComplete = false;
      allRows = [];
    }
    await fetchPage(false);
  }

  async function fetchPage(append) {
    const params = new URLSearchParams();
    params.set('filter', filterEl.value);
    const q = searchEl.value.trim();
    if (q) params.set('search', q);
    if (listCursor) params.set('cursor', listCursor);

    const r = await api('/api/licenses?' + params.toString(), { method: 'GET' });
    if (r.status === 401) {
      showLogin();
      return;
    }
    const j = await r.json();
    if (!r.ok) {
      statsEl.textContent = j.error || 'Failed to load';
      return;
    }
    trialPrefix = j.trial_prefix || trialPrefix;
    if (!append) allRows = [];
    allRows = allRows.concat(j.rows || []);
    listCursor = j.cursor || '';
    listComplete = !!j.complete;
    moreBtn.hidden = listComplete;
    render();
  }

  moreBtn.addEventListener('click', () => fetchPage(true));

  function render() {
    statsEl.textContent = allRows.length + ' license(s) in this page batch — filter: ' + filterEl.value;
    tbody.innerHTML = '';
    cards.innerHTML = '';

    for (const row of allRows) {
      const typeBadge = row.is_trial
        ? '<span class="badge badge-trial">Trial</span>'
        : '<span class="badge badge-paid">Paid</span>';
      const stBadge = row.is_expired
        ? '<span class="badge badge-expired">Expired</span>'
        : '<span class="badge badge-active">Not expired</span>';

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="mono">' + esc(row.license_key) + '</td>' +
        '<td>' + esc(row.company_name || '—') + '</td>' +
        '<td>' + typeBadge + '</td>' +
        '<td>' + esc(row.status) + ' ' + stBadge + '</td>' +
        '<td class="mono">' + esc(row.expiry || '—') + '</td>' +
        '<td>' + esc(String(row.activation_count)) + ' / ' + esc(String(row.max_devices)) + '</td>' +
        '<td><div class="row-actions">' +
        '<button type="button" class="small secondary btn-key" data-key="' + esc(row.license_key) + '">License key</button>' +
        '<button type="button" class="small btn-file" data-key="' + esc(row.license_key) + '" data-company="' + esc(row.company_name || '') + '">License file</button>' +
        '</div></td>';
      tbody.appendChild(tr);

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<h3 class="mono">' + esc(row.license_key) + '</h3>' +
        '<div class="meta">' + esc(row.company_name || '—') + '</div>' +
        '<div class="meta">' + typeBadge + ' · ' + esc(row.status) + '</div>' +
        '<div class="meta">' + esc(row.expiry || '—') + '</div>' +
        '<div class="meta">Activations: ' + esc(String(row.activation_count)) + ' / ' + esc(String(row.max_devices)) + '</div>' +
        '<div class="actions">' +
        '<button type="button" class="small secondary btn-key" data-key="' + esc(row.license_key) + '">License key</button>' +
        '<button type="button" class="small btn-file" data-key="' + esc(row.license_key) + '" data-company="' + esc(row.company_name || '') + '">License file</button>' +
        '</div>';
      cards.appendChild(card);
    }

    tbody.querySelectorAll('.btn-key').forEach((b) => b.addEventListener('click', () => openKeyModal(b.getAttribute('data-key'))));
    cards.querySelectorAll('.btn-key').forEach((b) => b.addEventListener('click', () => openKeyModal(b.getAttribute('data-key'))));
    tbody.querySelectorAll('.btn-file').forEach((b) => b.addEventListener('click', () => openFileModal(b.getAttribute('data-key'), b.getAttribute('data-company'))));
    cards.querySelectorAll('.btn-file').forEach((b) => b.addEventListener('click', () => openFileModal(b.getAttribute('data-key'), b.getAttribute('data-company'))));
  }

  function closeModal() {
    modalShell.hidden = true;
    modalBody.innerHTML = '';
  }
  $('#modal-close').addEventListener('click', closeModal);
  modalShell.addEventListener('click', (e) => { if (e.target === modalShell) closeModal(); });

  function openKeyModal(licenseKey) {
    modalTitle.textContent = 'License key';
    const isTrial = licenseKey.startsWith(trialPrefix);
    const hint = isTrial
      ? '<p class="muted">This is a <strong>trial</strong> key. It only works on the one device whose machine ID matches the part after ' +
        esc(trialPrefix) +
        '. On another PC, use <strong>Create paid license</strong> or start a trial there.</p>'
      : '<p class="muted"><strong>Paid</strong> license (16 characters). Enter this key in the app on each device you activate, until you hit the device limit.</p>';
    const win = formatWinKey(licenseKey);
    let groupedHtml = '';
    if (win && !isTrial) {
      groupedHtml =
        '<p class="muted">Grouped (cosmetic)</p><div class="win-key">' +
        esc(win) +
        '</div>';
    }
    modalBody.innerHTML =
      hint +
      '<div class="win-key" id="key-display">' +
      esc(licenseKey) +
      '</div>' +
      groupedHtml +
      '<button type="button" id="copy-key">Copy key</button>';
    modalShell.hidden = false;
    $('#copy-key').addEventListener('click', async () => {
      await navigator.clipboard.writeText(licenseKey);
      $('#copy-key').textContent = 'Copied';
      setTimeout(() => { $('#copy-key').textContent = 'Copy key'; }, 1500);
    });
  }

  async function openFileModal(licenseKey, company) {
    modalTitle.textContent = 'Download signed license file';
    const isTrial = licenseKey.startsWith(trialPrefix);
    let autoMid = isTrial ? licenseKey.slice(trialPrefix.length) : '';
    if (!autoMid) {
      try {
        const infoRes = await api(
          '/api/license-machine-ids?license_key=' +
            encodeURIComponent(licenseKey),
          { method: 'GET' }
        );
        if (infoRes.ok) {
          const info = await infoRes.json().catch(() => ({}));
          if (typeof info.inferred_machine_id === 'string') {
            autoMid = info.inferred_machine_id.trim();
          }
        }
      } catch {
        // Keep UI usable if lookup fails.
      }
    }
    if (!autoMid) {
      autoMid = await inferMachineIdByCompany(company, licenseKey);
    }
    const midNote = isTrial
      ? '<p class="muted">Machine ID is taken from this trial key. You can edit it if needed.</p>'
      : '<p class="muted">Machine ID is auto-filled when a single activation exists for this license. You can still edit it.</p>';
    modalBody.innerHTML =
      midNote +
      '<label>Machine ID</label><input type="text" id="mid" placeholder="machine id" style="width:100%;margin-bottom:0.75rem" value="' +
      esc(autoMid) +
      '"/>' +
      '<label>Company</label><select id="cname" style="width:100%;margin-bottom:0.75rem">' +
      getCompanyOptionsHtml((company || '').trim()) +
      '</select>' +
      '<div id="file-err" class="err" hidden></div>' +
      '<button type="button" id="dl-file">Download .json</button>';
    modalShell.hidden = false;
    $('#dl-file').addEventListener('click', async () => {
      let machine_id = $('#mid').value.trim();
      if (!machine_id && isTrial) {
        machine_id = autoMid;
        $('#mid').value = autoMid;
      }
      const fe = $('#file-err');
      fe.hidden = true;
      if (!machine_id) {
        fe.textContent = 'Machine ID is required';
        fe.hidden = false;
        return;
      }
      const company_name = $('#cname').value.trim();
      const r = await api('/api/sign-license-file', {
        method: 'POST',
        body: JSON.stringify({ license_key: licenseKey, machine_id, company_name: company_name || undefined }),
      });
      if (r.status === 401) {
        closeModal();
        showLogin();
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        fe.textContent = j.error || 'Failed';
        fe.hidden = false;
        return;
      }
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const dispo = r.headers.get('Content-Disposition');
      let fn = 'license.json';
      if (dispo && /filename="([^"]+)"/.test(dispo)) fn = dispo.match(/filename="([^"]+)"/)[1];
      a.download = fn;
      a.click();
      URL.revokeObjectURL(a.href);
      closeModal();
    });
  }

  function openCreateLicenseModal() {
    modalTitle.textContent = 'Create paid license';
    const companyOptionsHtml = getCompanyOptionsHtml('Customer');
    modalBody.innerHTML =
      '<p class="muted">Adds a new <strong>16-character</strong> key to the server (separate from per-device trial keys).</p>' +
      '<label>Company</label><select id="nc-name" style="width:100%;margin-bottom:0.75rem">' +
      companyOptionsHtml +
      '</select>' +
      '<label>Valid for (days)</label><input type="number" id="nc-days" min="1" max="3650" value="365" style="width:100%;margin-bottom:0.75rem"/>' +
      '<label>Max devices</label><input type="number" id="nc-dev" min="1" max="999" value="1" style="width:100%;margin-bottom:0.75rem"/>' +
      '<div id="nc-err" class="err" hidden></div>' +
      '<button type="button" id="nc-go">Create</button>';
    modalShell.hidden = false;
    $('#nc-go').addEventListener('click', async () => {
      const fe = $('#nc-err');
      fe.hidden = true;
      const r = await api('/api/licenses/create', {
        method: 'POST',
        body: JSON.stringify({
          company_name: $('#nc-name').value.trim() || 'Customer',
          expiry_days: Number($('#nc-days').value) || 365,
          max_devices: Number($('#nc-dev').value) || 1,
        }),
      });
      if (r.status === 401) {
        closeModal();
        showLogin();
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        fe.textContent = j.error || 'Failed';
        fe.hidden = false;
        return;
      }
      closeModal();
      await loadAllPages(true);
      openKeyModal(j.license_key);
    });
  }

  $('#create-lic').addEventListener('click', openCreateLicenseModal);

  (async function init() {
    const ok = await checkSession();
    if (ok) {
      showApp();
      await loadAllPages(true);
    } else {
      showLogin();
    }
  })();
})();
  </script>
</body>
</html>`;
}
