(() => {
  const body = document.body;
  const overlay = document.querySelector('[data-mega-overlay]');
  const layer = document.querySelector('.mega-layer');
  const triggers = [...document.querySelectorAll('.mega-trigger')];
  const menus = [...document.querySelectorAll('[data-mega]')];
  const mobileBtn = document.querySelector('.mobile-menu-button');

  const closeMenus = () => {
    menus.forEach(m => m.classList.remove('open'));
    triggers.forEach(t => t.classList.remove('menu-open'));
    if (overlay) overlay.classList.remove('visible');
    if (layer) layer.classList.remove('visible');
    document.body.classList.remove('mega-open');
  };

  const openMenu = (name) => {
    const menu = document.querySelector(`[data-mega="${name}"]`);
    if (!menu) return;
    const already = menu.classList.contains('open');
    closeMenus();
    if (already) return;
    menu.classList.add('open');
    const trigger = document.querySelector(`[data-menu="${name}"]`);
    if (trigger) trigger.classList.add('menu-open');
    overlay?.classList.add('visible');
    layer?.classList.add('visible');
    document.body.classList.add('mega-open');
  };

  triggers.forEach(t => t.addEventListener('click', () => openMenu(t.dataset.menu)));
  overlay?.addEventListener('click', closeMenus);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

  document.querySelectorAll('[data-demo-action]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    closeMenus();
    const toast = document.querySelector('.demo-toast');
    if (toast) {
      toast.textContent = 'Training demo: this module is a UI placeholder; no real banking action was performed.';
      toast.classList.add('show');
      window.setTimeout(() => toast.classList.remove('show'), 3200);
    }
  }));

  document.querySelectorAll('.text-size').forEach(btn => btn.addEventListener('click', () => {
    body.dataset.textSize = btn.dataset.fontSize;
  }));

  mobileBtn?.addEventListener('click', () => body.classList.toggle('mobile-nav-open'));

  document.querySelectorAll('.detail-tabs button').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.detail-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('account-placeholder-panel');
    const summary = document.getElementById('account-summary-panel');
    if (!panel || !summary) return;
    const isSummary = btn.dataset.tab === 'summary';
    summary.classList.toggle('hidden', !isSummary);
    panel.classList.toggle('hidden', isSummary);
    if (!isSummary) panel.querySelector('h3').textContent = btn.textContent.trim() + ' module';
  }));

  document.querySelectorAll('.account-selector').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.account-selector').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const id = btn.dataset.accountSelect;
    if (!id) return;
    fetch('/api/accounts').then(r => r.json()).then(accounts => {
      const a = accounts.find(x => String(x.id) === String(id));
      if (!a) return;
      const strongs = document.querySelectorAll('.summary-fields strong');
      if (strongs[1]) strongs[1].textContent = a.currency === 'INR' ? 'Rupees' : a.currency;
      const balance = document.querySelector('.balance-panel div:first-child strong');
      if (balance) balance.textContent = '₹' + Number(a.balance).toLocaleString('en-IN', {minimumFractionDigits: 2});
      const masked = document.querySelector('.masked-header');
      if (masked) masked.textContent = 'XXXXXXX' + a.account_number.slice(-4) + ' ◉';
    }).catch(() => {});
  }));
})();
