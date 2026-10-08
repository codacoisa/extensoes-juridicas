// Incorporado em cada IIFE; não expõe APIs na página nem requer rede.
const suiteUIRoots = new WeakMap();
const suiteDialogs = new WeakMap();
const SUITE_COMPONENTS = {
  panel: '.pj-panel, .pj-guides-manager, .pjc-panel, #pjip-modal-panel, .pjm-panel, .phm-panel, #pj-todo',
  header: '.pj-panel-header, .pj-guides-manager__header, #pj-panel-header, .pjip-modal-head, .pjm-head, .phm-head, #pj-todo-header',
  'brand-icon': '.pj-panel-brand-icon, .pj-guides-manager__brand-icon, .pjc-panel-brand-icon, .pjip-modal-brand-icon, .pjm-brand-icon, .pj-home-header-icon',
  title: '.pj-panel-title, .pj-guides-manager__title, .pjc-panel-brand > div > div:first-child, .pjip-modal-title, .pjm-title, .phm-title, .pj-home-header-title',
  subtitle: '.pj-panel-subtitle, .pj-guides-manager__header .pj-guides-inline__meta, .pjc-panel-brand > div > div:last-child, .pjip-modal-subtitle, .pjm-sub, .phm-subtitle, .pj-home-header-subtitle',
  body: '.pj-panel-body, .pj-guides-manager__body, #pj-panel-body, .pjip-modal-body, .pjm-body, .phm-body, .pj-home-layout, .pj-process-layout',
  card: '.pj-guides-inline, .pj-guides-home, .pj-card, .pj-guides-manager__toolbar, .pj-guides-manager__list-shell, .pjc-card, .pjip-deadline, .pjip-toolbar, .pjip-list-shell, .pjip-deadline-card, .pjm-card, .pj-home-summary, .pj-home-composer, .pj-guides-manager__summary, .pjip-summary, .phm-rule, .phm-field',
  'section-title': '.pj-guides-home__title, .pj-guides-inline__title, .pj-section-title, .pj-guides-manager__toolbar-title, .pj-guides-manager__list-title, .pjc-section-title, .pjip-section-title, .pjm-section-title, .pj-home-list-title',
  'summary-title': '.pj-summary-title, .pj-guides-manager__summary-title, .pjc-summary-title, .pjip-summary-title, .pjm-summary-title, .pj-home-summary-title',
  badge: '.pj-guides-badge, .pjip-item-status, .pjm-badge, .pj-tag',
  muted: '.pj-info, .pj-summary-sub, .pj-note-line2, .pj-note-line3, .pj-guides-manager__toolbar-meta, .pj-guides-manager__list-meta, .pj-guides-guide-sub, .pjc-card-desc, .pjc-note, .pjip-item-meta, .pjip-list-meta, .pjip-toolbar-meta, .pjm-item-meta, .pjm-summary-sub, .pj-home-summary-sub, .pj-meta',
  empty: '.pj-empty, .pj-guides-manager__empty, .pjip-empty',
  'table-wrap': '.pj-guides-manager__table-wrap',
  table: '.pj-guides-manager__table, .pj-guides-home__table',
  choice: '.pj-home-tab, .pjm-stat, .pjip-stat, .pj-guides-manager__stat, .pjc-category-button'
};

function prepareSuiteUI(root) {
  const doc = root.ownerDocument;
  if (!doc || !root.hasAttribute('data-pj-suite-ui')) return;
  if (!doc.getElementById('pj-suite-core-style')) {
    const style = doc.createElement('style');
    style.id = 'pj-suite-core-style';
    style.textContent = SUITE_UI_CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }
  const apply = subtree => {
    const visit = (selector, callback) => {
      if (subtree.matches(selector)) callback(subtree);
      subtree.querySelectorAll(selector).forEach(callback);
    };
    Object.entries(SUITE_COMPONENTS).forEach(([component, selector]) => {
      visit(selector, node => { node.dataset.pjSuiteComponent = component; });
    });
    visit('.pj-guides-badge, .pjip-item-status, .pjm-badge', node => {
      node.dataset.pjSuiteState = node.matches('.pj-guides-badge--overdue, .pjip-item-status--late') ? 'danger' : node.matches('.pj-guides-badge--paid, .pj-guides-badge--paid_manual, .pj-guides-badge--gratuidade, .pj-guides-badge--parcelamento_pago, .pj-guides-badge--parcelamento_realizado, .pjip-item-status--done, .pjm-badge--done') ? 'success' : node.matches('.pj-guides-badge--due_today, .pj-guides-badge--due_soon, .pj-guides-badge--due_week, .pjip-item-status--soon') ? 'warning' : 'neutral';
    });
    visit('input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="file"]):not([type="hidden"]), select, textarea', node => {
      node.dataset.pjSuiteComponent = 'field';
      if (!node.labels?.length && !node.hasAttribute('aria-label') && !node.hasAttribute('aria-labelledby')) {
        const roleLabels = { 'status-filter': 'Filtrar por status', 'sort-by': 'Ordenar intimações', 'deadline-date': 'Data limite', 'deadline-range-start': 'Início do período', 'deadline-range-end': 'Fim do período' };
        const idLabels = { 'pj-guides-filter': 'Filtrar guias por situação', 'pj-notes-io': 'Dados das anotações em JSON' };
        const label = roleLabels[node.dataset.role] || idLabels[node.id] || node.placeholder || node.title;
        if (label) node.setAttribute('aria-label', label);
      }
    });
    visit('button', node => {
      // Os atalhos isolados acompanham o tamanho do ícone nativo do Projudi.
      if (node === root || node.matches('.pj-note-color-dot, [data-pj-suite-component="choice"]')) return;
      node.dataset.pjSuiteComponent = 'button';
      const primary = '.pj-add, .pj-guides-btn--primary, .pjip-modal-btn--primary, .pjm-btn--primary, .phm-btn-save, #pj-save, .pj-backup-ui__button--primary';
      const danger = '.pj-del, .pj-note-delete, .pj-guides-btn--danger, .pjip-modal-btn--danger, .pjm-btn--danger, .pjc-btn-danger, .pj-backup-ui__button--danger';
      node.dataset.pjSuiteTone = node.matches(primary) ? 'primary' : node.matches(danger) ? 'danger' : node.matches('.pj-backup-ui__button--success') ? 'success' : node.matches('.pj-guides-btn--warn') ? 'warning' : 'neutral';
      const close = '.pj-panel-close, .pj-guides-close-btn, #pj-close, .pjip-modal-close, .pjm-close, .phm-close, .pj-backup-ui__close';
      const compact = '.pj-mini, .pj-todo-btn, .pj-note-icon-btn, .pj-note-tool-btn, .pj-guides-btn--icon, .pj-guides-btn--tool, .pj-edit-tags, .pj-move, .pj-del, .pj-guides-toast__close';
      node.dataset.pjSuiteSize = node.matches(close) ? 'close' : node.matches(compact) ? 'compact' : 'regular';
      if (!node.hasAttribute('aria-label') && !node.textContent.trim() && node.title) node.setAttribute('aria-label', node.title);
    });
    visit('.pj-backup-ui__status, .pj-guides-toast__text', node => {
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
    });
  };
  apply(root);
  if (suiteUIRoots.has(root)) return;
  // Só processa novos subtrees pertencentes à extensão, mesmo sem sprite disponível.
  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) apply(node);
    }));
    // Uma ação pode substituir a linha que tinha foco; manter o teclado no diálogo.
    if (root.isConnected && (doc.activeElement === doc.body || doc.activeElement === doc.documentElement)) {
      const dialogs = [...root.querySelectorAll('[data-pj-suite-dialog="active"]')].filter(node => node.getClientRects().length);
      const dialog = dialogs[dialogs.length - 1];
      if (dialog) dialog.focus({ preventScroll: true });
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  suiteUIRoots.set(root, observer);
}

function releaseSuiteUI(root) {
  suiteUIRoots.get(root)?.disconnect();
  suiteUIRoots.delete(root);
  fontAwesomeRoots.get(root)?.disconnect();
  fontAwesomeRoots.delete(root);
}

function activateSuiteDialog(dialog, onClose) {
  if (!dialog || suiteDialogs.has(dialog)) return;
  const doc = dialog.ownerDocument;
  const previousFocus = doc.activeElement;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('data-pj-suite-dialog', 'active');
  if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
    const title = dialog.querySelector('[data-pj-suite-component="title"], .pj-backup-ui__title, .phm-title');
    dialog.setAttribute('aria-label', title?.textContent.trim() || 'Painel Projudi');
  }
  dialog.tabIndex = -1;
  const focusables = () => [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]')].filter(node =>
    !node.disabled && node.tabIndex >= 0 && !node.closest('[hidden], [inert]') && node.getClientRects().length && doc.defaultView.getComputedStyle(node).visibility !== 'hidden'
  );
  const keydown = event => {
    if (event.target.closest('[data-pj-suite-dialog="active"]') !== dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    } else if (event.key === 'Tab') {
      const items = focusables();
      event.preventDefault();
      if (!items.length) { dialog.focus(); return; }
      const current = items.indexOf(doc.activeElement);
      const next = current < 0 ? (event.shiftKey ? items.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    }
  };
  dialog.addEventListener('keydown', keydown);
  suiteDialogs.set(dialog, { previousFocus, keydown });
  (focusables()[0] || dialog).focus({ preventScroll: true });
}

function deactivateSuiteDialog(dialog) {
  if (!dialog) return;
  // Fechar o painel principal também libera os backups que pertencem a ele.
  [...dialog.querySelectorAll('[data-pj-suite-dialog="active"]')].reverse().forEach(deactivateSuiteDialog);
  const session = suiteDialogs.get(dialog);
  if (!session) return;
  dialog.removeEventListener('keydown', session.keydown);
  dialog.removeAttribute('data-pj-suite-dialog');
  suiteDialogs.delete(dialog);
  if (session.previousFocus?.isConnected && session.previousFocus.getClientRects().length) session.previousFocus.focus({ preventScroll: true });
}

function setSuitePopoverOpen(popover, open, onClose) {
  if (!popover) return;
  const dialog = popover.querySelector('.pj-backup-ui__dialog');
  if (!open) deactivateSuiteDialog(dialog);
  popover.dataset.open = open ? 'true' : 'false';
  if (open) activateSuiteDialog(dialog, onClose);
}
