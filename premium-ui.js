(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  const SYNC_STATE_KEY = 'moneyflow-sync-state';
  let syncInFlight = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const readState = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
        budgets: Array.isArray(raw.budgets) ? raw.budgets : [],
        loans: Array.isArray(raw.loans) ? raw.loans : [],
        categories: Array.isArray(raw.categories) ? raw.categories : [],
        settings: raw.settings || {},
        reportMonth: raw.reportMonth || new Date().toISOString().slice(0, 7)
      };
    } catch (_) { return { transactions: [], budgets: [], loans: [], categories: [], settings: {}, reportMonth: new Date().toISOString().slice(0, 7) }; }
  };
  const writeState = state => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const money = value => `${Math.round(Number(value) || 0).toLocaleString()} MMK`;
  const toast = (message, tone = '') => { const node = $('#toast'); if (!node) return; node.textContent = message; node.dataset.tone = tone; node.classList.add('on'); clearTimeout(node._timer); node._timer = setTimeout(() => node.classList.remove('on'), 2800); };
  const setSyncStatus = (message, tone = 'idle') => { const node = $('#syncStatus'); if (node) { node.textContent = message; node.dataset.status = tone; } };

  const style = document.createElement('style');
  style.textContent = `
    .settings-management{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.settings-management .section-title{grid-column:1/-1;margin:0}.settings-management .panel{margin:0;padding:16px}.settings-management .stack-form{gap:10px}.settings-management h2{margin:.2rem 0;font-size:1.15rem}.settings-management .section-title p{margin:.2rem 0;font-size:.85rem}.compact-list{display:grid;gap:6px;margin-top:10px;max-height:180px;overflow:auto}.compact-list .category-pod{padding:7px 9px;font-size:.85rem}.modal-backdrop{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:clamp(12px,4vw,36px);background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}.modal-backdrop[hidden]{display:none}.transaction-modal{width:min(620px,100%);max-height:min(90dvh,760px);overflow:auto;margin:0;padding:clamp(18px,4vw,30px);background:var(--surface-solid);color:var(--text);border:1px solid var(--line);box-shadow:0 28px 90px rgba(0,0,0,.32)}.transaction-modal .stack-form{gap:15px}.transaction-modal label{gap:6px}.transaction-modal input,.transaction-modal select{min-height:46px}.transaction-tabs{display:flex;gap:8px;margin-bottom:16px}.transaction-tab{flex:1;border:1px solid var(--line);border-radius:12px;padding:10px;background:transparent;color:var(--text);font-weight:700}.transaction-tab.active{border-color:var(--blue);background:rgba(79,140,255,.15);color:var(--blue)}.modal-close{border:0;background:transparent;color:var(--muted);font-size:1.6rem;cursor:pointer}.form-error{display:none;margin-bottom:14px;padding:11px 13px;border:1px solid rgba(251,113,133,.45);border-radius:12px;background:rgba(251,113,133,.1);color:var(--red);font-weight:600}.form-error.show{display:block}.premium-action{background:linear-gradient(135deg,var(--blue),var(--violet));color:#fff!important;box-shadow:0 12px 28px rgba(79,140,255,.28);font-weight:800;transform:translateY(0);transition:transform .2s,box-shadow .2s}.premium-action:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(79,140,255,.38)}.budget-bar-card{display:grid;gap:7px}.budget-bar-card .bar-head{display:flex;justify-content:space-between;gap:10px;font-size:.88rem}.budget-bar-card .bar-track{height:18px;background:rgba(148,163,184,.16);border:1px solid var(--line);border-radius:999px;overflow:hidden}.budget-bar-card .bar-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--cyan));transition:width .35s ease}.budget-bar-card.over .bar-fill{background:linear-gradient(90deg,var(--violet),var(--red))}.sync-status{display:inline-flex;align-items:center;gap:7px;min-height:32px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:.75rem;font-weight:800;white-space:nowrap}.sync-status:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.sync-status[data-status=success]{color:var(--green)}.sync-status[data-status=warning]{color:var(--yellow)}.sync-status[data-status=error]{color:var(--red)}.sync-status[data-status=loading]{color:var(--blue)}.sync-status[data-status=loading]:before{animation:syncPulse 1s infinite}@keyframes syncPulse{50%{opacity:.3;transform:scale(.7)}}select,select option{background:var(--surface-solid);color:var(--text);color-scheme:light}body.dark select,body.dark select option{background:#0d1424;color:#f2f6ff;color-scheme:dark}.sidebar-menu-toggle{transition:transform .2s,background .2s,box-shadow .2s}.sidebar-menu-toggle:hover{transform:translateY(-2px);background:rgba(79,140,255,.16);box-shadow:0 10px 24px rgba(79,140,255,.18)}.app-layout .sidebar{transition:width .3s cubic-bezier(.22,1,.36,1),padding .3s ease,transform .3s ease}.app-layout .main-area{transition:width .3s cubic-bezier(.22,1,.36,1)}
    @media(max-width:760px){.settings-management{grid-template-columns:1fr}.settings-management .section-title{grid-column:auto}.sidebar-menu-toggle{min-height:44px}.transaction-modal{max-height:calc(100dvh - 24px)}}
    @media(prefers-reduced-motion:reduce){.app-layout .sidebar,.app-layout .main-area,.premium-action,.sidebar-menu-toggle{transition:none}}
  `;
  document.head.appendChild(style);

  const ensureSyncStatus = () => {
    const actions = $('.topbar-actions');
    if (!actions || $('#syncStatus')) return;
    const status = document.createElement('span'); status.id = 'syncStatus'; status.className = 'sync-status'; status.dataset.status = 'idle'; status.textContent = 'Ready to sync'; status.setAttribute('aria-live', 'polite');
    const syncButton = $('[data-action="sync-google"]', actions); syncButton?.before(status);
  };

  const ensureManagement = () => {
    const settings = $('#settings');
    if (!settings || $('#settingsManagement')) return;
    const host = document.createElement('div'); host.id = 'settingsManagement'; host.className = 'settings-management';
    host.innerHTML = `
      <div class="section-title"><small>Planning tools</small><h2>Budget & categories</h2><p>Compact controls for your monthly plan.</p></div>
      <div class="panel"><div class="section-head"><h3>Budget management</h3></div><form id="budgetForm" class="stack-form"><label><span>Category</span><select name="budgetCategory"></select></label><label><span>Month</span><input name="budgetMonth" type="month" required></label><label><span>Amount</span><input name="budgetAmount" type="number" min="1" required></label><button class="primary-btn premium-action" type="submit">Save budget</button></form><div id="compactBudgetList" class="compact-list"></div></div>
      <div class="panel"><div class="section-head"><h3>Category management</h3></div><form id="categoryForm" class="stack-form"><label><span>Name</span><input name="categoryName" required placeholder="Food, Salary"></label><label><span>Type</span><select name="categoryType"><option value="expense">Expense</option><option value="income">Income</option></select></label><button class="primary-btn premium-action" type="submit">Add category</button></form><div id="compactCategoryList" class="compact-list"></div></div>`;
    settings.appendChild(host);
    populateManagement();
  };
  const populateManagement = () => {
    const state = readState();
    const budgetCategory = $('[name="budgetCategory"]');
    if (budgetCategory) budgetCategory.innerHTML = state.categories.filter(c => c.type === 'expense').map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('') || '<option value="">Add an expense category first</option>';
    const month = $('[name="budgetMonth"]'); if (month) month.value = state.reportMonth || new Date().toISOString().slice(0, 7);
    const budgets = $('#compactBudgetList'); if (budgets) budgets.innerHTML = state.budgets.slice(-6).reverse().map(b => `<div class="category-pod"><span>${escapeHtml(b.category)} · ${escapeHtml(b.month || '')}</span><strong>${money(b.amount)}</strong></div>`).join('') || '<small class="muted">No budgets yet.</small>';
    const categories = $('#compactCategoryList'); if (categories) categories.innerHTML = state.categories.slice(-6).reverse().map(c => `<div class="category-pod"><span>${escapeHtml(c.name)}</span><span class="tag ${c.type}">${escapeHtml(c.type)}</span></div>`).join('') || '<small class="muted">No categories yet.</small>';
  };

  const openTransactionModal = () => {
    const original = $('#transactionForm');
    if (!original || original.closest('.transaction-modal')) return;
    const modal = document.createElement('div'); modal.id = 'transactionModal'; modal.className = 'modal-backdrop';
    modal.innerHTML = '<div class="transaction-modal" role="dialog" aria-modal="true" aria-labelledby="transactionModalTitle"><div class="section-head"><div><small>Quick entry</small><h2 id="transactionModalTitle">Add transaction</h2></div><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="transaction-tabs"><button type="button" class="transaction-tab active">Income / Expense</button><button type="button" class="transaction-tab">Loan repayment</button></div></div>';
    const shell = $('.transaction-modal', modal); const error = document.createElement('div'); error.className = 'form-error'; error.id = 'transactionFormError'; original.parentElement.removeChild(original); shell.append(error, original); document.body.appendChild(modal);
    const close = () => { modal.remove(); document.body.classList.remove('modal-open'); }; $('.modal-close', modal).addEventListener('click', close); modal.addEventListener('click', e => { if (e.target === modal) close(); });
    const tabs = $$('.transaction-tab', modal); tabs[1].addEventListener('click', () => { tabs.forEach(t => t.classList.remove('active')); tabs[1].classList.add('active'); const type = $('[name="type"]', original); if (type) { type.value = 'expense'; type.disabled = true; } error.textContent = 'Loan repayment validation is handled before saving. Select the loan and enter an amount within its remaining balance.'; error.classList.add('show'); }); tabs[0].addEventListener('click', () => { tabs.forEach(t => t.classList.remove('active')); tabs[0].classList.add('active'); $('[name="type"]', original).disabled = false; error.classList.remove('show'); });
    original.addEventListener('submit', () => setTimeout(close, 120), { once: true });
    document.body.classList.add('modal-open'); setTimeout(() => $('[name="amount"]', original)?.focus(), 0);
  };

  const renderBudgetChart = () => {
    const host = $('#budgetVsSpendingChart'); if (!host) return;
    const state = readState(); const month = state.reportMonth || new Date().toISOString().slice(0, 7); const tx = state.transactions.filter(t => String(t.date || '').slice(0, 7) === month && t.type === 'expense');
    const rows = state.budgets.filter(b => String(b.month || '').slice(0, 7) === month).map(b => ({ label: b.category, budget: Number(b.amount || 0), spent: tx.filter(t => t.category === b.category).reduce((s, t) => s + Number(t.amount || 0), 0) }));
    if (!rows.length) { host.innerHTML = '<p class="budget-chart-empty">No budget data for this month.</p>'; return; }
    host.innerHTML = rows.map(row => { const percent = row.budget ? Math.min(100, row.spent / row.budget * 100) : 0; return `<div class="budget-bar-card ${percent > 100 ? 'over' : ''}"><div class="bar-head"><strong>${escapeHtml(row.label)}</strong><span>${money(row.spent)} / ${money(row.budget)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(percent, row.spent ? 4 : 0)}%"></div></div></div>`; }).join('');
  };

  const enhanceActions = () => $$('button.primary-btn, [data-action="sync-google"]').forEach(button => button.classList.add('premium-action'));
  const init = () => { ensureSyncStatus(); ensureManagement(); enhanceActions(); renderBudgetChart(); document.addEventListener('click', e => { if (e.target.closest('[data-page="add"]')) { e.preventDefault(); openTransactionModal(); } }); document.addEventListener('submit', e => { if (e.target.id === 'budgetForm' || e.target.id === 'categoryForm') setTimeout(() => { populateManagement(); renderBudgetChart(); }, 80); }); document.addEventListener('change', e => { if (e.target.id === 'monthSelect') setTimeout(renderBudgetChart, 60); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
