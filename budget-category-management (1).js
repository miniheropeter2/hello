(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  const MANAGEMENT_STYLE_ID = 'budget-category-management-style';

  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  };

  const writeState = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  };

  const ensureArrays = (state) => {
    state.budgets = Array.isArray(state.budgets) ? state.budgets : [];
    state.categories = Array.isArray(state.categories) ? state.categories : [];
    return state;
  };

  const id = (prefix) => window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const amount = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\"': '&quot;',
    "'": '&#39;'
  }[char] || char));

  const currentMonth = () => document.getElementById('monthSelect')?.value
    || new Date().toISOString().slice(0, 7);

  const notify = (message, error = false) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.tone = error ? 'error' : 'success';
    toast.classList.add('on');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('on'), 2600);
  };

  const refreshApp = () => {
    const state = ensureArrays(readState());
    writeState(state);
    window.dispatchEvent(new CustomEvent('moneyflow:state-updated'));
    document.dispatchEvent(new CustomEvent('moneyflow:settings-changed'));
  };

  const addStyles = () => {
    if (document.getElementById(MANAGEMENT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MANAGEMENT_STYLE_ID;
    style.textContent = `
      .budget-category-management-list { display:grid; gap:8px; margin-top:14px; }
      .budget-category-management-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border:1px solid var(--line); border-radius:12px; background:rgba(79,140,255,.04); }
      .budget-category-management-meta { display:grid; gap:3px; min-width:0; }
      .budget-category-management-meta strong { overflow-wrap:anywhere; }
      .budget-category-management-meta small { color:var(--muted); }
      .budget-category-management-actions { display:flex; gap:6px; flex:0 0 auto; }
      .budget-category-management-actions button { min-height:32px; padding:6px 9px; border:1px solid var(--line); border-radius:9px; background:rgba(148,163,184,.08); color:var(--text); font-size:.75rem; font-weight:700; }
      .budget-category-management-actions .delete { color:var(--red); }
      .budget-category-type { display:grid; gap:8px; margin-top:12px; }
      .budget-category-type span { color:var(--muted); font-size:.87rem; font-weight:600; }
      .budget-category-type select { min-height:42px; padding:0 12px; border:1px solid var(--line); border-radius:12px; background:var(--surface-solid); color:var(--text); }
    `;
    document.head.appendChild(style);
  };

  const getBudgetHost = () => {
    const form = document.getElementById('budgetForm');
    if (!form) return null;
    let host = document.getElementById('budgetManagementList');
    if (!host) {
      host = document.createElement('div');
      host.id = 'budgetManagementList';
      host.className = 'budget-category-management-list';
      form.closest('.panel')?.appendChild(host);
    }
    return host;
  };

  const getCategoryHost = () => {
    const form = document.getElementById('categoryForm');
    if (!form) return null;
    let host = document.getElementById('categoryManagementList');
    if (!host) {
      host = document.createElement('div');
      host.id = 'categoryManagementList';
      host.className = 'budget-category-management-list';
      form.closest('.panel')?.appendChild(host);
    }
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

  const renderBudgets = () => {
    const host = getBudgetHost();
    if (!host) return;
    const state = ensureArrays(readState());
    const rows = [...state.budgets].reverse();

    host.innerHTML = rows.length ? rows.map((row) => `
      <div class="budget-category-management-row">
        <div class="budget-category-management-meta">
          <strong>${escapeHtml(row.category)}</strong>
          <small>${escapeHtml(row.month)} · ${amount(row.amount).toLocaleString('en-US')} MMK</small>
        </div>
        <div class="budget-category-management-actions">
          <button type="button" data-bcm-edit-budget="${escapeHtml(row.id)}">Edit</button>
          <button type="button" class="delete" data-bcm-delete-budget="${escapeHtml(row.id)}">Delete</button>
        </div>
      </div>
    `).join('') : '<div class="empty-state">No budgets yet.</div>';
  };

  const renderCategories = () => {
    const host = getCategoryHost();
    if (!host) return;
    const state = ensureArrays(readState());
    host.innerHTML = state.categories.length ? state.categories.map((category) => `
      <div class="budget-category-management-row">
        <div class="budget-category-management-meta">
          <strong>${escapeHtml(category.name)}</strong>
          <small>${escapeHtml(category.type || 'expense')}</small>
        </div>
        <div class="budget-category-management-actions">
          <button type="button" data-bcm-edit-category="${escapeHtml(category.id)}">Edit</button>
          <button type="button" class="delete" data-bcm-delete-category="${escapeHtml(category.id)}">Delete</button>
        </div>
      </div>
    `).join('') : '<div class="empty-state">No categories yet.</div>';
  };

  const render = () => {
    ensureCategoryType();
    renderBudgets();
    renderCategories();
  };

  const submitBudget = (form) => {
    const state = ensureArrays(readState());
    const category = String(form.elements.budgetCategory?.value || '').trim();
    const value = amount(form.elements.budgetAmount?.value);

    if (!category || value <= 0) {
      notify('Enter a valid budget category and amount.', true);
      return;
    }

    const selectedMonth = currentMonth();
    const existing = state.budgets.find((row) => row.category === category && row.month === selectedMonth);

    if (existing) {
      existing.amount = value;
    } else {
      state.budgets.push({
        id: id('budget'),
        category,
        month: selectedMonth,
        amount: value,
        createdAt: new Date().toISOString()
      });
    }

    writeState(state);
    form.reset();
    refreshApp();
    render();
    notify(existing ? 'Budget updated.' : 'Budget saved.');
  };

  const submitCategory = (form) => {
    const state = ensureArrays(readState());
    const name = String(form.elements.categoryName?.value || '').trim();
    const type = String(form.elements.categoryType?.value || 'expense');

    if (!name) {
      notify('Category name is required.', true);
      return;
    }

    if (state.categories.some((item) => String(item.name).toLowerCase() === name.toLowerCase())) {
      notify('This category already exists.', true);
      return;
    }

    state.categories.push({
      id: id('category'),
      name,
      type,
      createdAt: new Date().toISOString()
    });

    writeState(state);
    form.reset();
    refreshApp();
    render();
    notify('Category added.');
  };

  const handleSubmit = (event) => {
    const form = event.target.closest('form');
    if (!form || !['budgetForm', 'categoryForm'].includes(form.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (form.id === 'budgetForm') submitBudget(form);
    else submitCategory(form);
  };

  const handleClick = (event) => {
    const editBudget = event.target.closest('[data-bcm-edit-budget]');
    const deleteBudget = event.target.closest('[data-bcm-delete-budget]');
    const editCategory = event.target.closest('[data-bcm-edit-category]');
    const deleteCategory = event.target.closest('[data-bcm-delete-category]');

    const state = ensureArrays(readState());

    if (editBudget) {
      const row = state.budgets.find((item) => String(item.id) === editBudget.dataset.bcmEditBudget);
      if (!row) return;

      const newCategory = window.prompt('Budget category', row.category);
      if (newCategory === null) return;

      const newAmount = window.prompt('Budget amount', row.amount);
      if (newAmount === null || amount(newAmount) <= 0) return notify('Enter a valid budget amount.', true);

      row.category = newCategory.trim() || row.category;
      row.amount = amount(newAmount);

      writeState(state);
      refreshApp();
      render();
      notify('Budget updated.');
      return;
    }

    if (deleteBudget) {
      if (!window.confirm('Delete this budget?')) return;

      state.budgets = state.budgets.filter((item) => String(item.id) !== deleteBudget.dataset.bcmDeleteBudget);

      writeState(state);
      refreshApp();
      render();
      notify('Budget deleted.');
      return;
    }

    if (editCategory) {
      const row = state.categories.find((item) => String(item.id) === editCategory.dataset.bcmEditCategory);
      if (!row) return;

      const newName = window.prompt('Category name', row.name);
      if (newName === null || !newName.trim()) return;

      const newType = window.prompt('Category type: income or expense', row.type || 'expense');
      if (newType === null) return;

      row.name = newName.trim();
      row.type = newType.toLowerCase() === 'income' ? 'income' : 'expense';

      writeState(state);
      refreshApp();
      render();
      notify('Category updated.');
      return;
    }

    if (deleteCategory) {
      if (!window.confirm('Delete this category?')) return;

      state.categories = state.categories.filter((item) => String(item.id) !== deleteCategory.dataset.bcmDeleteCategory);

      writeState(state);
      refreshApp();
      render();
      notify('Category deleted.');
    }
  };

  const init = () => {
    addStyles();
    render();
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('click', handleClick);
    window.addEventListener('moneyflow:state-updated', render);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
