/* Application-level repairs. This file deliberately owns data integrity and save events,
   while the existing UI remains responsible for presentation. */
(() => {
  'use strict';
  const KEY = 'moneyflow-v3';
  const $ = (id) => document.getElementById(id);
  const uuid = (prefix) => window.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const number = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const write = (state) => localStorage.setItem(KEY, JSON.stringify(state));
  const unique = (rows, key) => {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => { if (row && row[key] != null) map.set(String(row[key]), row); });
    return [...map.values()];
  };
  const normalize = (state) => {
    state.transactions = unique(state.transactions, 'id');
    state.budgets = unique(state.budgets, 'id');
    state.loans = unique(state.loans, 'id');
    state.categories = Array.isArray(state.categories) ? state.categories : [];
    state.categories = [...new Map(state.categories.filter((c) => c?.name).map((c) => [String(c.name).trim().toLowerCase(), c])).values()];
    state.loans.forEach((loan) => {
      loan.principal = number(loan.principal || loan.amount);
      loan.remaining = Math.max(0, number(loan.remaining ?? loan.balance ?? loan.principal));
      loan.balance = loan.remaining;
      loan.paid = Math.max(0, number(loan.paid || loan.principal - loan.remaining));
    });
    return state;
  };
  const changed = () => {
    window.dispatchEvent(new CustomEvent('moneyflow:state-updated'));
    document.dispatchEvent(new CustomEvent('moneyflow:settings-changed'));
    if (window.syncToGoogleSheets) window.syncToGoogleSheets('save');
  };
  const close = () => { $('transactionModal')?.classList.add('hidden'); document.body.classList.remove('modal-open'); };

  // The original form handler only recorded loan repayment transactions. Intercept the
  // form before it runs so receiving a loan creates the loan record as well.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form || form.id !== 'transactionForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const state = normalize(read());
    const type = form.elements.type?.value || 'expense';
    const category = String(form.elements.category?.value || 'General').trim();
    const date = form.elements.date?.value || new Date().toISOString().slice(0, 10);
    const note = String(form.elements.note?.value || '').trim();
    const loanId = String(form.elements.loanId?.value || '');
    const repayment = number(form.elements.repaymentAmount?.value);
    const tab = form.closest('#transactionModal')?.querySelector('.transaction-tab.active')?.dataset.mode;
    const isRepayment = tab === 'repayment' || Boolean(loanId && repayment);
    const amount = isRepayment ? repayment : number(form.elements.amount?.value);
    if (amount <= 0) return;
    if (isRepayment && !loanId) return;
    const loanCategory = /^(loan|loan received|borrowed)$/i.test(category);
    const tx = { id: uuid('tx'), type: isRepayment ? 'expense' : (loanCategory ? 'income' : type), amount, date, category: isRepayment ? 'Loan repayment' : category, note, loanId: '' , createdAt: new Date().toISOString() };
    if (loanCategory && !isRepayment) {
      tx.loanId = uuid('loan');
      state.loans.push({ id: tx.loanId, name: note || 'Loan', principal: amount, remaining: amount, balance: amount, paid: 0, date, note, createdAt: tx.createdAt });
    }
    if (isRepayment) {
      tx.loanId = loanId;
      const loan = state.loans.find((item) => String(item.id) === loanId);
      if (loan) { loan.remaining = Math.max(0, number(loan.remaining ?? loan.balance) - amount); loan.balance = loan.remaining; loan.paid = number(loan.paid) + amount; }
    }
    state.transactions.push(tx);
    write(normalize(state));
    window.dispatchEvent(new CustomEvent('moneyflow:state-updated'));
    if (window.renderAll) window.renderAll();
    close();
    document.getElementById('toast')?.classList.add('show');
    if (window.syncToGoogleSheets) window.syncToGoogleSheets('save');
  }, true);

  // Normalize old records once on startup and after a remote merge. This prevents the
  // legacy balance/remaining split and duplicate rows from leaking into the UI.
  const repair = () => { const state = normalize(read()); write(state); if (window.renderAll) window.renderAll(); };
  window.addEventListener('moneyflow:state-updated', repair);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', repair, { once: true }); else repair();
})();
