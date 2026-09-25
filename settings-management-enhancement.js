(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; }
  };
  const saveState = (state) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  };
  const number = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
  const makeId = (prefix) => window.crypto?.randomUUID ? window.crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const currentMonth = () => document.getElementById('monthSelect')?.value || new Date().toISOString().slice(0, 7);
  const money = (value) => `${Math.round(number(value)).toLocaleString('en-US')} MMK`;
  const toast = (message, error = false) => {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = error ? 'error' : 'success';
    node.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('on'), 2600);
  };

  const style = () => {
    if (document.getElementById('settings-management-style')) return;
    const node = document.createElement('style');
    node.id = 'settings-management-style';
    node.textContent = `
      .settings-management-list { display:grid; gap:8px; margin-top:14px; }
      .settings-management-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border:1px solid var(--line); border-radius:12px; background:rgba(79,140,255,.04); }
      .settings-management-row .meta { min-width:0; display:grid; gap:3px; }
      .settings-management-row .meta strong { overflow-wrap:anywhere; }
      .settings-management-row .meta small { color:var(--muted); }
      .settings-management-actions { display:flex; gap:6px; flex:0 0 auto; }
      .settings-management-actions button { min-height:32px; padding:6px 9px; border:1px solid var(--line); border-radius:9px; background:rgba(148,163,184,.08); color:var(--text); font-size:.75rem; font-weight:700; }
      .settings-management-actions .delete { color:var(--red); }
      .settings-type-field { display:grid; gap:8px; margin-top:14px; }
      .settings-type-field span { color:var(--muted); font-size:.87rem; font-weight:600; }
      .settings-type-field select { min-height:42px; padding:0 12px; border:1px solid var(--line); border-radius:12px; background:var(--surface-solid); color:var(--text); }
      .switch-control { position:relative; display:inline-flex; width:46px; height:26px; flex:0 0 auto; }
      .switch-control input { position:absolute; opacity:0; width:0; height:0; }
      .switch-control .slider { position:absolute; inset:0; border-radius:999px; background:rgba(148,163,184,.35); border:1px solid var(--line); transition:.18s ease; cursor:pointer; }
      .switch-control .slider::before { content:""; position:absolute; width:20px; height:20px; left:2px; top:2px; border-radius:50%; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,.25); transition:.18s ease; }
      .switch-control input:checked + .slider { background:linear-gradient(135deg,var(--blue),var(--violet)); border-color:transparent; }
      .switch-control input:checked + .slider::before { transform:translateX(20px); }
      .switch-control input:focus-visible + .slider { box-shadow:0 0 0 3px rgba(34,211,238,.18); }
    `;
    document.head.appendChild(node);
  };

  const ensureHost = (panel, id) => {
    let host = document.getElementById(id);
    if (!host) {
      host = document.createElement('div');
      host.id = id;
      host.className = 'settings-management-list';
      panel.appendChild(host);
    }
    return host;
  };

  const settingsPanels = () => Array.from(document.querySelectorAll('#settings .panel'));

  const setupBudgetForm = () => {
    const form = document.getElementById('budgetForm');
    if (!form || form.dataset.managementReady) return;
    form.dataset.managementReady = 'true';
    const panel = form.closest('.panel');
    ensureHost(panel, 'budgetManagementList');
  };

  const setupCategoryForm = () => {
    const form = document.getElementById('categoryForm');
    if (!form || form.dataset.managementReady) return;
    form.dataset.managementReady = 'true';
    const panel = form.closest('.panel');
    const typeField = document.createElement('label');
    typeField.className = 'settings-type-field';
    typeField.innerHTML = '<span>Type</span><select name="categoryType"><option value="expense">Expense</option><option value="income">Income</option></select>';
    form.insertBefore(typeField, form.querySelector('button[type="submit"]'));
    ensureHost(panel, 'categoryManagementList');
  };

  const renderBudgets = () => {
    const host = document.getElementById('budgetManagementList');
    if (!host) return;
    const state = readState();
    const rows = Array.isArray(state.budgets) ? state.budgets.slice().reverse() : [];
    host.innerHTML = rows.length ? rows.map((row) => `
      <div class="settings-management-row">
        <div class="meta"><strong>${esc(row.category)}</strong><small>${esc(row.month)} · ${money(row.amount)}</small></div>
        <div class="settings-management-actions"><button type="button" data-edit-budget="${esc(row.id)}">Edit</button><button type="button" class="delete" data-delete-budget="${esc(row.id)}">Delete</button></div>
      </div>
    `).join('') : '<div class="empty-state">No budgets yet.</div>';
  };

  const renderCategories = () => {
    const host = document.getElementById('categoryManagementList');
    if (!host) return;
    const state = readState();
    const rows = Array.isArray(state.categories) ? state.categories : [];
    host.innerHTML = rows.length ? rows.map((row) => `
      <div class="settings-management-row">
        <div class="meta"><strong>${esc(row.name)}</strong><small>${esc(row.type || 'expense')}</small></div>
        <div class="settings-management-actions"><button type="button" data-edit-category="${esc(row.id)}">Edit</button><button type="button" class="delete" data-delete-category="${esc(row.id)}">Delete</button></div>
      </div>
    `).join('') : '<div class="empty-state">No categories yet.</div>';
  };

  const render = () => { setupBudgetForm(); setupCategoryForm(); renderBudgets(); renderCategories(); };

  const handleSubmit = (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id !== 'budgetForm' && form.id !== 'categoryForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const state = readState();
    state.budgets = Array.isArray(state.budgets) ? state.budgets : [];
    state.categories = Array.isArray(state.categories) ? state.categories : [];

    if (form.id === 'budgetForm') {
      const category = String(form.elements.budgetCategory?.value || '').trim();
      const amount = number(form.elements.budgetAmount?.value);
      if (!category || amount <= 0) return toast('Enter a category and a valid budget amount.', true);
      const month = currentMonth();
      const existing = state.budgets.find((row) => row.category === category && row.month === month);
      if (existing) existing.amount = amount;
      else state.budgets.push({ id: makeId('budget'), category, month, amount, createdAt: new Date().toISOString() });
      saveState(state); form.reset(); render(); window.dispatchEvent(new CustomEvent('moneyflow:state-updated')); toast(existing ? 'Budget updated.' : 'Budget saved.');
      return;
    }

    const name = String(form.elements.categoryName?.value || '').trim();
    const type = String(form.elements.categoryType?.value || 'expense');
    if (!name) return toast('Category name is required.', true);
    if (state.categories.some((row) => String(row.name).toLowerCase() === name.toLowerCase())) return toast('This category already exists.', true);
    state.categories.push({ id: makeId('category'), name, type, createdAt: new Date().toISOString() });
    saveState(state); form.reset(); render(); window.dispatchEvent(new CustomEvent('moneyflow:state-updated')); toast('Category added.');
  };

  const handleClick = (event) => {
    const editBudget = event.target.closest('[data-edit-budget]');
    const deleteBudget = event.target.closest('[data-delete-budget]');
    const editCategory = event.target.closest('[data-edit-category]');
    const deleteCategory = event.target.closest('[data-delete-category]');
    const state = readState();

    if (editBudget) {
      const row = (state.budgets || []).find((item) => item.id === editBudget.dataset.editBudget);
      if (!row) return;
      const category = window.prompt('Budget category', row.category);
      if (category === null) return;
      const amount = window.prompt('Budget amount', row.amount);
      if (amount === null || number(amount) <= 0) return toast('Enter a valid budget amount.', true);
      row.category = category.trim() || row.category; row.amount = number(amount);
      saveState(state); render(); window.dispatchEvent(new CustomEvent('moneyflow:state-updated')); toast('Budget updated.');
    }
    if (deleteBudget) {
      if (!window.confirm('Delete this budget?')) return;
      state.budgets = (state.budgets || []).filter((item) => item.id !== deleteBudget.dataset.deleteBudget);
      saveState(state); render(); window.dispatchEvent(new CustomEvent('moneyflow:state-updated')); toast('Budget deleted.');
    }
    if (editCategory) {
      const row = (state.categories || []).find((item) => item.id === editCategory.dataset.editCategory);
      if (!row) return;
      const name = window.prompt('Category name', row.name);
      if (name === null || !name.trim()) return;
      const type = window.prompt('Category type: income or expense', row.type || 'expense');
      if (type === null) return;
      row.name = name.trim(); row.type = type.toLowerCase() === 'income' ? 'income' : 'expense';
      saveState(state); render(); window.dispatchEvent(new CustomEvent('moneyflow:state-updated')); toast('Category updated.');
    }
    if (deleteCategory) {
      if (!window.confirm('Delete this category?')) return;
      state.categories = (state.categories || []).filter((item) => item.id !== deleteCategory.dataset.deleteCategory);
      saveState(state); render(); window.dispatchEvent(new CustomEvent('moneyflow:state-updated')); toast('Category deleted.');
    }
  };

  const setupDarkToggle = () => {
    const old = document.getElementById('darkModeToggle');
    if (!old || old.dataset.switchReady) return;
    old.dataset.switchReady = 'true';
    const label = old.closest('.toggle-row');
    if (!label) return;
    old.outerHTML = `<span class="switch-control"><input id="darkModeToggle" type="checkbox" aria-label="Dark mode"><span class="slider"></span></span>`;
    const toggle = document.getElementById('darkModeToggle');
    const state = readState();
    toggle.checked = (state.settings?.theme || 'dark') !== 'light';
    toggle.addEventListener('change', () => {
      const current = readState();
      current.settings = current.settings || {};
      current.settings.theme = toggle.checked ? 'dark' : 'light';
      saveState(current);
      document.body.classList.toggle('dark', toggle.checked);
    });
  };

  const init = () => {
    style(); render(); setupDarkToggle();
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('click', handleClick);
    window.addEventListener('moneyflow:state-updated', render);
    new MutationObserver(() => { render(); setupDarkToggle(); }).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
