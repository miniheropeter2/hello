(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  let syncInFlight = false;
  let syncQueued = false;

  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; }
  };
  const saveState = (state) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  };
  const getSyncUrl = () => String(readState()?.settings?.syncUrl || '').trim();

  const setStatus = (message, tone = 'idle') => {
    const node = document.getElementById('syncStatus');
    if (node) { node.textContent = message; node.dataset.status = tone; }
  };
  const showToast = (message, tone = 'success') => {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message; node.dataset.tone = tone; node.classList.add('on');
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => node.classList.remove('on'), 2600);
  };
  const ensureSyncUrlInput = () => {
    const existing = document.getElementById('syncUrl');
    if (existing) return existing;
    const list = document.querySelector('#settings .settings-list');
    if (!list) return null;
    const row = document.createElement('label');
    row.className = 'sync-url-row';
    row.innerHTML = '<span>Google Apps Script URL</span><input id="syncUrl" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/AK.../exec" autocomplete="url">';
    list.appendChild(row);
    return row.querySelector('input');
  };
  const wireSyncUrl = () => {
    const input = ensureSyncUrlInput();
    if (!input || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true'; input.value = getSyncUrl();
    input.addEventListener('input', (event) => {
      const state = readState(); state.settings = state.settings || {};
      state.settings.syncUrl = String(event.target.value || '').trim(); saveState(state);
      setStatus(state.settings.syncUrl ? 'Ready to sync' : 'Sync URL required', state.settings.syncUrl ? 'idle' : 'warning');
    });
  };
  const requestJson = async (url, options = {}) => {
    let response;
    try { response = await fetch(url, options); } catch (error) { throw new Error(`Network/CORS error: ${error.message || 'request blocked'}`); }
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; } catch (_) { throw new Error('Apps Script returned a non-JSON response. Use the deployed /exec URL.'); }
    if (!response.ok || result.ok === false) throw new Error(result.error || result.message || `Sync failed (${response.status})`);
    return result.data || result;
  };

  const byId = (rows) => new Map((Array.isArray(rows) ? rows : []).filter((row) => row?.id).map((row) => [String(row.id), row]));
  const mergeById = (local, remote) => {
    const merged = new Map();
    (Array.isArray(remote) ? remote : []).forEach((row) => row?.id && merged.set(String(row.id), row));
    (Array.isArray(local) ? local : []).forEach((row) => row?.id && merged.set(String(row.id), row));
    return [...merged.values()];
  };
  const mergeCategories = (local, remote) => {
    const merged = new Map();
    [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])].forEach((row) => {
      if (!row?.name) return;
      const key = `${String(row.name).trim().toLowerCase()}|${String(row.type || 'expense').toLowerCase()}`;
      merged.set(key, { ...merged.get(key), ...row });
    });
    return [...merged.values()];
  };
  const mergeData = (local, remote) => {
    const incoming = remote || {};
    return {
      ...local,
      transactions: mergeById(local.transactions, incoming.transactions),
      loans: mergeById(local.loans, incoming.loans),
      budgets: mergeById(local.budgets, incoming.budgets),
      categories: mergeCategories(local.categories, incoming.categories)
    };
  };
  const applyState = (state) => {
    const current = readState();
    saveState({ ...current, ...state, settings: { ...(current.settings || {}), ...(state.settings || {}) } });
    window.dispatchEvent(new CustomEvent('moneyflow:state-updated'));
  };

  const pull = async (url, reason = 'silent') => {
    setStatus('Loading from Google Sheets…', 'loading');
    const remote = await requestJson(`${url}${url.includes('?') ? '&' : '?'}action=getAll`, { method: 'GET', cache: 'no-store' });
    if (reason === 'manual') showToast('Loaded data from Google Sheets.');
    return remote;
  };
  const push = async (url, state) => requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'appendDelta',
      transactions: Array.isArray(state.transactions) ? state.transactions : [],
      loans: Array.isArray(state.loans) ? state.loans : [],
      budgets: Array.isArray(state.budgets) ? state.budgets : [],
      categories: Array.isArray(state.categories) ? state.categories : [],
      syncedAt: new Date().toISOString()
    })
  });

  const syncToGoogleSheets = async (reason = 'manual') => {
    if (syncInFlight) { syncQueued = true; return false; }
    const url = getSyncUrl();
    if (!url) { setStatus('Sync URL required', 'warning'); if (reason === 'manual') showToast('Add your Google Apps Script URL in Settings.', 'error'); return false; }
    syncInFlight = true;
    try {
      // Always pull first. Merge by stable IDs/natural category key before pushing.
      const localBefore = readState();
      const remote = await pull(url, reason === 'manual' ? 'manual' : 'silent');
      const merged = mergeData(localBefore, remote);
      applyState(merged);
      await push(url, merged);
      setStatus('Synced and loaded just now', 'success');
      if (reason === 'manual') showToast('Google Sheets sync completed.');
      return true;
    } catch (error) {
      setStatus('Sync failed', 'error'); showToast(error.message || 'Sync failed. Check the Apps Script deployment.', 'error'); return false;
    } finally {
      syncInFlight = false;
      if (syncQueued) { syncQueued = false; setTimeout(() => syncToGoogleSheets('save'), 50); }
    }
  };

  const bind = () => {
    wireSyncUrl();
    document.getElementById('syncButton')?.addEventListener('click', () => syncToGoogleSheets('manual'));
    // Covers static forms and dynamically-created transaction/loan forms.
    document.addEventListener('submit', (event) => {
      if (!event.target.closest('form')) return;
      const url = getSyncUrl();
      if (url) setTimeout(() => syncToGoogleSheets('save'), 250);
    }, true);
    window.syncToGoogleSheets = syncToGoogleSheets;
    window.pullFromGoogleSheets = () => { const url = getSyncUrl(); return url ? pull(url, 'manual') : false; };
    const url = getSyncUrl(); setStatus(url ? 'Ready to sync' : 'Sync URL required', url ? 'idle' : 'warning');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
