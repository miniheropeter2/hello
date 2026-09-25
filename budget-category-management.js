(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  const STYLE_ID = 'budget-category-management-style';
  let initialized = false;

  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; }
  };
  const saveState = (state) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  };
  const ensureState = (state) => {
    state.budgets = Array.isArray(state.budgets) ? state.budgets : [];
    state.categories = Array.isArray(state.categories) ? state.categories : [];
    state.settings = state.settings || {};
    return state;
  };
  const makeId = (prefix) => window.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const number = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const month = () => document.getElementById('monthSelect')?.value || new Date().toISOString().slice(0, 7);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));

  const notify = (message, error = false) => {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = error ? 'error' : 'success';
    node.classList.add('on');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => node.classList.remove('on'), 2600);
  };

  const refresh = () => {
    window.dispatchEvent(new CustomEvent('moneyflow:state-updated'));
    document.dispatchEvent(new CustomEvent('moneyflow:settings-changed'));
  };

  const addStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .budget-category-management-list{display:grid;gap:8px;margin-top:14px}
      .budget-category-management-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(79,140,255,.04)}
      .budget-category-management-meta{display:grid;gap:3px;min-width:0}.budget-category-management-meta strong{overflow-wrap:anywhere}.budget-category-management-meta small{color:var(--muted)}
      .budget-category-management-actions{display:flex;gap:6px;flex:0 0 auto}.budget-category-management-actions button{min-height:32px;padding:6px 9px;border:1px solid var(--line);border-radius:9px;background:rgba(148,163,184,.08);color:var(--text);font-size:.75rem;font-weight:700}.budget-category-management-actions .delete{color:var(--red)}
      .budget-category-type{display:grid;gap:8px;margin-top:12px}.budget-category-type select{min-height:42px;padding:0 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-solid);color:var(--text)}
      .moneyflow-switch{position:relative;display:inline-flex;width:46px;height:26px;flex:0 0 auto}.moneyflow-switch input{position:absolute;opacity:0;width:0;height:0}.moneyflow-switch .slider{position:absolute;inset:0;border:1px solid var(--line);border-radius:999px;background:rgba(148,163,184,.35);cursor:pointer;transition:.18s}.moneyflow-switch .slider:before{content:"";position:absolute;width:20px;height:20px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:.18s}.moneyflow-switch input:checked+.slider{background:linear-gradient(135deg,var(--blue),var(--violet));border-color:transparent}.moneyflow-switch input:checked+.slider:before{transform:translateX(20px)}
    `;
    document.head.appendChild(style);
  };

  const ensureHost = (form, id) => {
    if (!form) return null;
    let host = document.getElementById(id);
    if (!host) { host = document.createElement('div'); host.id = id; host.className = 'budget-category-management-list'; form.closest('.panel')?.appendChild(host); }
    return host;
  };

  const ensureCategoryType = () => {
    const form = document.getElementById('categoryForm');
    if (!form || form.elements.categoryType) return;
    const label = document.createElement('label');
    label.className = 'budget-category-type';
    label.innerHTML = '<span>Type</span><select name="categoryType"><option value="expense">Expense</option><option value="income">Income</option></select>';
    form.insertBefore(label, form.querySelector('button[type="submit"]'));
  };

  const render = () => {
    ensureCategoryType();
    const state = ensureState(readState());
    const budgets = ensureHost(document.getElementById('budgetForm'), 'budgetManagementList');
    const categories = ensureHost(document.getElementById('categoryForm'), 'categoryManagementList');
    if (budgets) budgets.innerHTML = state.budgets.length ? [...state.budgets].reverse().map((row) => `<div class="budget-category-management-row"><div class="budget-category-management-meta"><strong>${escapeHtml(row.category)}</strong><small>${escapeHtml(row.month)} · ${number(row.amount).toLocaleString('en-US')} MMK</small></div><div class="budget-category-management-actions"><button type="button" data-bcm-edit-budget="${escapeHtml(row.id)}">Edit</button><button type="button" class="delete" data-bcm-delete-budget="${escapeHtml(row.id)}">Delete</button></div></div>`).join('') : '<div class="empty-state">No budgets yet.</div>';
    if (categories) categories.innerHTML = state.categories.length ? state.categories.map((row) => `<div class="budget-category-management-row"><div class="budget-category-management-meta"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.type || 'expense')}</small></div><div class="budget-category-management-actions"><button type="button" data-bcm-edit-category="${escapeHtml(row.id)}">Edit</button><button type="button" class="delete" data-bcm-delete-category="${escapeHtml(row.id)}">Delete</button></div></div>`).join('') : '<div class="empty-state">No categories yet.</div>';
  };

  const setupDarkToggle = () => {
    const old = document.getElementById('darkModeToggle');
    if (!old || old.dataset.moneyflowSwitch) return;
    const row = old.closest('.toggle-row');
    if (!row) return;
    const state = ensureState(readState());
    old.dataset.moneyflowSwitch = 'true';
    old.outerHTML = `<span class="moneyflow-switch"><input id="darkModeToggle" type="checkbox" aria-label="Dark mode" ${state.settings.theme !== 'light' ? 'checked' : ''}><span class="slider"></span></span>`;
    document.getElementById('darkModeToggle')?.addEventListener('change', (event) => {
      const next = ensureState(readState());
      next.settings.theme = event.target.checked ? 'dark' : 'light';
      saveState(next);
      document.body.classList.toggle('dark', event.target.checked);
    });
  };

  const handleSubmit = (event) => {
    const form = event.target.closest('form');
    if (!form || !['budgetForm', 'categoryForm'].includes(form.id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const state = ensureState(readState());
    if (form.id === 'budgetForm') {
      const category = String(form.elements.budgetCategory?.value || '').trim();
      const value = number(form.elements.budgetAmount?.value);
      if (!category || value <= 0) return notify('Enter a valid budget category and amount.', true);
      const selectedMonth = month();
      const existing = state.budgets.find((row) => row.category === category && row.month === selectedMonth);
      if (existing) existing.amount = value; else state.budgets.push({ id: makeId('budget'), category, month: selectedMonth, amount: value, createdAt: new Date().toISOString() });
      saveState(state); form.reset(); render(); refresh(); notify(existing ? 'Budget updated.' : 'Budget saved.');
    } else {
      const name = String(form.elements.categoryName?.value || '').trim();
      const type = String(form.elements.categoryType?.value || 'expense');
      if (!name) return notify('Category name is required.', true);
      if (state.categories.some((row) => String(row.name).toLowerCase() === name.toLowerCase())) return notify('This category already exists.', true);
      state.categories.push({ id: makeId('category'), name, type, createdAt: new Date().toISOString() });
      saveState(state); form.reset(); render(); refresh(); notify('Category added.');
    }
  };

  const handleClick = (event) => {
    const state = ensureState(readState());
    const editBudget = event.target.closest('[data-bcm-edit-budget]');
    const deleteBudget = event.target.closest('[data-bcm-delete-budget]');
    const editCategory = event.target.closest('[data-bcm-edit-category]');
    const deleteCategory = event.target.closest('[data-bcm-delete-category]');
    if (editBudget) { const row = state.budgets.find((item) => String(item.id) === editBudget.dataset.bcmEditBudget); if (!row) return; const category = prompt('Budget category', row.category); if (category === null) return; const value = prompt('Budget amount', row.amount); if (value === null || number(value) <= 0) return notify('Enter a valid amount.', true); row.category = category.trim() || row.category; row.amount = number(value); saveState(state); render(); refresh(); notify('Budget updated.'); }
    if (deleteBudget) { if (!confirm('Delete this budget?')) return; state.budgets = state.budgets.filter((item) => String(item.id) !== deleteBudget.dataset.bcmDeleteBudget); saveState(state); render(); refresh(); notify('Budget deleted.'); }
    if (editCategory) { const row = state.categories.find((item) => String(item.id) === editCategory.dataset.bcmEditCategory); if (!row) return; const name = prompt('Category name', row.name); if (name === null || !name.trim()) return; const type = prompt('Category type: income or expense', row.type || 'expense'); if (type === null) return; row.name = name.trim(); row.type = type.toLowerCase() === 'income' ? 'income' : 'expense'; saveState(state); render(); refresh(); notify('Category updated.'); }
    if (deleteCategory) { if (!confirm('Delete this category?')) return; state.categories = state.categories.filter((item) => String(item.id) !== deleteCategory.dataset.bcmDeleteCategory); saveState(state); render(); refresh(); notify('Category deleted.'); }
  };

  const init = () => {
    if (initialized) return;
    initialized = true;
    addStyles(); render(); setupDarkToggle();
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('click', handleClick);
    window.addEventListener('moneyflow:state-updated', () => { render(); setupDarkToggle(); });
  };

  window.initializeBudgetCategoryManagement = init;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
