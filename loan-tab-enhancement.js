(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; }
  };
  const saveState = (state) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  };
  const number = (value) => Number(String(value ?? '0').replace(/,/g, '')) || 0;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
  const id = () => window.crypto?.randomUUID ? window.crypto.randomUUID() : `loan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const money = (value) => `${Math.round(number(value)).toLocaleString('en-US')} MMK`;

  const ensureLoanCategory = (select) => {
    if (!select) return;
    let option = Array.from(select.options).find((item) => item.value.toLowerCase() === 'loan');
    if (!option) {
      option = document.createElement('option');
      option.value = 'Loan';
      option.textContent = 'Loan';
      select.appendChild(option);
    }
    select.value = 'Loan';
  };

  const populateRepayments = (modal) => {
    const state = readState();
    const select = modal.querySelector('select[name="loanId"]');
    if (!select) return;
    const loans = (state.loans || []).filter((loan) => number(loan.balance ?? loan.remaining) > 0);
    select.innerHTML = loans.length
      ? loans.map((loan) => `<option value="${esc(loan.id)}">${esc(loan.name || 'Loan')} · ${money(loan.balance ?? loan.remaining)}</option>`).join('')
      : '<option value="">No outstanding loans</option>';
    select.disabled = !loans.length;
  };

  const addStyles = () => {
    if (document.getElementById('loan-tab-enhancement-style')) return;
    const style = document.createElement('style');
    style.id = 'loan-tab-enhancement-style';
    style.textContent = `
      .transaction-tabs .loan-tab { display: inline-flex; }
      .transaction-modal .loan-note-hint { color: var(--muted); font-size: .78rem; margin-top: -10px; }
      .transaction-modal .transaction-tab.is-disabled { opacity: .5; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  };

  const setLoanMode = (modal, mode) => {
    const form = modal.querySelector('#transactionForm');
    if (!form) return;
    const tabs = modal.querySelectorAll('.transaction-tab');
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
    const repaymentFields = modal.querySelector('#repaymentFields');
    const type = form.querySelector('select[name="type"]');
    const category = form.querySelector('select[name="category"]');
    const amount = form.querySelector('input[name="amount"]');
    const repaymentAmount = form.querySelector('input[name="repaymentAmount"]');
    const loanSelect = form.querySelector('select[name="loanId"]');
    const note = form.querySelector('input[name="note"]');
    const noteHint = modal.querySelector('.loan-note-hint');
    const isLoan = mode === 'loan';
    const isRepayment = mode === 'repayment';
    repaymentFields?.classList.toggle('hidden', !isRepayment);
    if (isLoan) {
      type.value = 'income';
      type.disabled = true;
      ensureLoanCategory(category);
      category.disabled = true;
      amount.required = true;
      repaymentAmount.required = false;
      loanSelect.required = false;
      if (note) note.placeholder = 'Loan name';
      if (noteHint) noteHint.hidden = false;
    } else if (isRepayment) {
      type.value = 'expense';
      type.disabled = true;
      category.value = 'Loan repayment';
      category.disabled = true;
      amount.required = false;
      repaymentAmount.required = true;
      loanSelect.required = true;
      if (note) note.placeholder = 'Optional note';
      if (noteHint) noteHint.hidden = true;
      populateRepayments(modal);
    } else {
      type.disabled = false;
      category.disabled = false;
      amount.required = true;
      repaymentAmount.required = false;
      loanSelect.required = false;
      if (note) note.placeholder = 'Optional note';
      if (noteHint) noteHint.hidden = true;
    }
  };

  const enhanceModal = (modal) => {
    if (modal.dataset.loanEnhanced === 'true') return;
    modal.dataset.loanEnhanced = 'true';
    addStyles();
    const tabs = modal.querySelector('.transaction-tabs');
    const standardTab = tabs?.querySelector('[data-mode="standard"]');
    if (!tabs || !standardTab) return;
    const loanTab = document.createElement('button');
    loanTab.type = 'button';
    loanTab.className = 'transaction-tab loan-tab';
    loanTab.dataset.mode = 'loan';
    loanTab.textContent = 'Loan';
    standardTab.insertAdjacentElement('afterend', loanTab);

    const note = modal.querySelector('input[name="note"]');
    if (note) {
      const hint = document.createElement('small');
      hint.className = 'loan-note-hint';
      hint.hidden = true;
      hint.textContent = 'The note is saved as the loan name.';
      note.closest('label')?.appendChild(hint);
    }

    tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('.transaction-tab');
      if (!tab) return;
      event.preventDefault();
      setLoanMode(modal, tab.dataset.mode);
    }, true);
    populateRepayments(modal);
    setLoanMode(modal, 'standard');
  };

  const saveLoan = (form, errorBox) => {
    const state = readState();
    state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
    state.loans = Array.isArray(state.loans) ? state.loans : [];
    const amount = number(form.querySelector('input[name="amount"]')?.value);
    const note = String(form.querySelector('input[name="note"]')?.value || '').trim();
    const date = form.querySelector('input[name="date"]')?.value || new Date().toISOString().slice(0, 10);
    if (!amount || amount <= 0) return 'Enter a valid loan amount greater than zero.';
    if (!note) return 'Enter the loan name in the Note field.';
    const loanId = id();
    state.loans.push({ id: loanId, name: note, principal: amount, paid: 0, balance: amount, remaining: amount, date, note, createdAt: new Date().toISOString() });
    state.transactions.push({ id: id(), type: 'income', category: 'Loan', amount, date, note, loanId, loanType: 'loan', createdAt: new Date().toISOString() });
    saveState(state);
    window.dispatchEvent(new CustomEvent('moneyflow:state-updated'));
    return '';
  };

  const saveRepayment = (form, errorBox) => {
    const state = readState();
    state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
    state.loans = Array.isArray(state.loans) ? state.loans : [];
    const loanId = form.querySelector('select[name="loanId"]')?.value || '';
    const amount = number(form.querySelector('input[name="repaymentAmount"]')?.value);
    const loan = state.loans.find((item) => String(item.id) === String(loanId));
    if (!loan || number(loan.balance ?? loan.remaining) <= 0) return 'Select an outstanding loan.';
    if (!amount || amount <= 0) return 'Enter a valid repayment amount.';
    if (amount > number(loan.balance ?? loan.remaining)) return 'Repayment cannot exceed the outstanding loan balance.';
    const date = form.querySelector('input[name="date"]')?.value || new Date().toISOString().slice(0, 10);
    const note = String(form.querySelector('input[name="note"]')?.value || '').trim();
    loan.paid = number(loan.paid) + amount;
    loan.balance = Math.max(0, number(loan.balance ?? loan.remaining) - amount);
    loan.remaining = loan.balance;
    state.transactions.push({ id: id(), type: 'expense', category: 'Loan repayment', amount, date, note, loanId, loanType: 'payback', createdAt: new Date().toISOString() });
    saveState(state);
    window.dispatchEvent(new CustomEvent('moneyflow:state-updated'));
    return '';
  };

  const handleSubmit = (event) => {
    const form = event.target.closest('#transactionForm');
    if (!form) return;
    const modal = form.closest('#transactionModal');
    const mode = modal?.querySelector('.transaction-tab.active')?.dataset.mode;
    if (!modal || !['loan', 'repayment'].includes(mode)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const errorBox = modal.querySelector('#transactionFormError');
    const error = mode === 'loan' ? saveLoan(form, errorBox) : saveRepayment(form, errorBox);
    if (error) {
      if (errorBox) { errorBox.textContent = error; errorBox.classList.add('visible'); }
      return;
    }
    if (errorBox) errorBox.classList.remove('visible');
    window.syncToGoogleSheets?.('save');
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    document.querySelector('#toast')?.classList.remove('on');
    window.location.reload();
  };

  const observer = new MutationObserver(() => {
    const modal = document.getElementById('transactionModal');
    if (modal) enhanceModal(modal);
  });

  const init = () => {
    document.addEventListener('submit', handleSubmit, true);
    observer.observe(document.body, { childList: true, subtree: true });
    const modal = document.getElementById('transactionModal');
    if (modal) enhanceModal(modal);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
