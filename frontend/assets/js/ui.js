/* =====================================================================
   Couponaut — shared UI helpers
   toasts · modals · command palette · formatting · icons · skeletons
   ===================================================================== */
(function (global) {
  // ---- DOM helpers ----
  const el = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null || c === false) return;
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  // ---- Toasts ----
  function ensureToastRoot() {
    let r = el('#toasts');
    if (!r) { r = h('div', { id: 'toasts' }); document.body.appendChild(r); }
    return r;
  }
  function toast(message, type = 'info', timeout = 3500) {
    const root = ensureToastRoot();
    const t = h('div', { class: 'toast ' + type }, message);
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = 'all .25s'; setTimeout(() => t.remove(), 250); }, timeout);
  }

  // ---- Formatting ----
  const fmt = {
    money(cents, currency = 'USD') {
      const v = (Number(cents) || 0) / 100;
      try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v); }
      catch (e) { return '$' + v.toFixed(2); }
    },
    moneyVal(v, currency = 'USD') {
      try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(v) || 0); }
      catch (e) { return '$' + (Number(v) || 0).toFixed(2); }
    },
    num(n) { return new Intl.NumberFormat('en-US').format(Number(n) || 0); },
    date(s) { if (!s) return '—'; const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z')); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); },
    ago(s) {
      if (!s) return '—';
      const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'));
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    },
    discount(c) {
      if (c.discount_type === 'percent' && c.discount_value) return Math.round(c.discount_value) + '% OFF';
      if (c.discount_type === 'amount' && c.discount_value) return '$' + Math.round(c.discount_value) + ' OFF';
      if (c.discount_type === 'free_shipping' || c.type === 'free_shipping') return 'FREE SHIP';
      return 'DEAL';
    }
  };

  // ---- Icons (Lucide-grade line set, 24x24 grid, currentColor) ----
  // Authentic Lucide path data (ISC licensed) rendered with consistent
  // stroke + round caps so every icon across the app feels premium & uniform.
  const ICON_PATHS = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>',
    bolt: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    trendingUp: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    spider: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    send: '<path d="M14.54 21.69a.5.5 0 0 0 .94-.02l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/>',
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    badgeCheck: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2.5a.5.5 0 0 1 .5.5v.5a2 2 0 0 1-2 2 1 1 0 0 0 0 2 4 4 0 0 0 4-4V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2.5a.5.5 0 0 1 .5.5v.5a2 2 0 0 1-2 2 1 1 0 0 0 0 2 4 4 0 0 0 4-4V5a2 2 0 0 0-2-2z"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
    shoppingBag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.13-.5-4 1.5-5.5 0 0 .5 2.5 2 4 1.51 1.51 2.5 3.18 2.5 5a6 6 0 0 1-12 0c0-1.61.83-3.06 1.5-4.5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  };
  const ICON_FILLED = {
    star: '<path d="M11.53 2.36a.5.5 0 0 1 .94 0l2.43 5.86 6.32.5a.5.5 0 0 1 .29.88l-4.82 4.12 1.47 6.17a.5.5 0 0 1-.75.55L12 17.5l-5.4 3.34a.5.5 0 0 1-.75-.55l1.47-6.17L2.5 9.6a.5.5 0 0 1 .29-.88l6.32-.5z"/>',
  };
  const icon = (name) => {
    if (ICON_FILLED[name]) return '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' + ICON_FILLED[name] + '</svg>';
    const p = ICON_PATHS[name];
    if (!p) return '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  };

  // ---- Modal ----
  function modal(title, contentNode, opts = {}) {
    const backdrop = h('div', { class: 'modal-backdrop open' });
    const box = h('div', { class: 'modal card', style: 'padding:1.4rem;' });
    box.appendChild(h('div', { class: 'flex items-center justify-between', style: 'margin-bottom:1rem;' }, [
      h('h3', { class: 'h-display', style: 'font-size:1.15rem;' }, title),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => backdrop.remove() }, '✕'),
    ]));
    box.appendChild(contentNode);
    backdrop.appendChild(box);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    document.body.appendChild(backdrop);
    return { close: () => backdrop.remove(), node: box };
  }

  function confirmDialog(message, onConfirm) {
    const body = h('div', {}, [
      h('p', { class: 'text-muted', style: 'margin:0 0 1.2rem;' }, message),
      h('div', { class: 'flex justify-end gap-2' }, [
        h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn btn-danger', onclick: () => { m.close(); onConfirm(); } }, 'Confirm'),
      ]),
    ]);
    const m = modal('Are you sure?', body);
  }

  // ---- Command palette ----
  let cmdkItems = [];
  function setupCommandPalette(items) {
    cmdkItems = items;
    let root = el('#cmdk');
    if (!root) {
      root = h('div', { id: 'cmdk' }, [
        h('div', { class: 'panel card', style: 'padding:0.5rem;' }, [
          h('input', { id: 'cmdk-input', class: 'input', placeholder: 'Type a command or search…', style: 'border:none;background:transparent;font-size:1rem;' }),
          h('div', { id: 'cmdk-list', style: 'margin-top:0.4rem;max-height:50vh;overflow:auto;' }),
        ]),
      ]);
      document.body.appendChild(root);
      root.addEventListener('click', e => { if (e.target === root) closeCmdk(); });
      el('#cmdk-input', root).addEventListener('input', renderCmdk);
      el('#cmdk-input', root).addEventListener('keydown', cmdkKeys);
    }
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleCmdk(); }
      if (e.key === 'Escape') closeCmdk();
    });
  }
  let cmdkActive = 0;
  function renderCmdk() {
    const q = (el('#cmdk-input').value || '').toLowerCase();
    const list = el('#cmdk-list');
    const filtered = cmdkItems.filter(i => i.label.toLowerCase().includes(q));
    cmdkActive = 0;
    list.innerHTML = '';
    filtered.forEach((i, idx) => {
      list.appendChild(h('div', { class: 'cmdk-item' + (idx === 0 ? ' active' : ''), onclick: () => { closeCmdk(); i.action(); } }, [
        h('span', { style: 'width:18px;height:18px;display:inline-flex;', html: icon(i.icon || 'bolt') }),
        h('span', {}, i.label),
      ]));
    });
    if (!filtered.length) list.appendChild(h('div', { class: 'text-muted', style: 'padding:0.7rem 1rem;' }, 'No results'));
  }
  function cmdkKeys(e) {
    const items = els('.cmdk-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdkActive = Math.min(cmdkActive + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkActive = Math.max(cmdkActive - 1, 0); }
    else if (e.key === 'Enter') { items[cmdkActive]?.click(); return; }
    else return;
    items.forEach((it, i) => it.classList.toggle('active', i === cmdkActive));
  }
  function toggleCmdk() { const r = el('#cmdk'); r.classList.contains('open') ? closeCmdk() : openCmdk(); }
  function openCmdk() { const r = el('#cmdk'); r.classList.add('open'); el('#cmdk-input').value = ''; renderCmdk(); setTimeout(() => el('#cmdk-input').focus(), 30); }
  function closeCmdk() { el('#cmdk')?.classList.remove('open'); }

  // ---- Misc ----
  function copyToClipboard(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 'ok'));
    const ta = h('textarea', { style: 'position:fixed;opacity:0;' }); ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast('Copied', 'ok');
  }
  function skeletonList(n = 5, height = '64px') {
    return h('div', { class: 'grid gap-2' }, Array.from({ length: n }, () => h('div', { class: 'skeleton', style: 'height:' + height })));
  }
  function requireAuthRedirect() {
    if (!API.isAuthed()) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return false; }
    return true;
  }

  // ---- Ads / monetization (admin-controlled; renders after chat responses) ----
  const Ads = {
    _cfg: null,
    _adsense: false,
    _ezoic: false,
    count: 0,
    async config() {
      if (this._cfg) return this._cfg;
      try { this._cfg = await API.get('/ads', { noAuth: true }); }
      catch (e) { this._cfg = { enabled: false }; }
      return this._cfg;
    },
    // Call after each assistant response; honors the configured frequency.
    async afterResponse(target) {
      const c = await this.config();
      if (!c || !c.enabled) return;
      this.count += 1;
      const freq = Math.max(1, parseInt(c.frequency, 10) || 1);
      if (this.count % freq !== 0) return;
      this.render(target, c);
    },
    render(target, c) {
      const box = h('div', { class: 'chat-ad' }, [h('div', { class: 'chat-ad-label' }, 'Sponsored')]);
      const slot = h('div', { class: 'chat-ad-slot' });
      box.appendChild(slot);
      target.appendChild(box);
      try {
        if (c.network === 'adsense' && c.adsense_client) {
          if (!this._adsense) {
            const s = document.createElement('script');
            s.async = true;
            s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(c.adsense_client);
            s.crossOrigin = 'anonymous';
            document.head.appendChild(s);
            this._adsense = true;
          }
          const ins = document.createElement('ins');
          ins.className = 'adsbygoogle';
          ins.style.display = 'block';
          ins.setAttribute('data-ad-client', c.adsense_client);
          if (c.adsense_slot) ins.setAttribute('data-ad-slot', c.adsense_slot);
          ins.setAttribute('data-ad-format', 'auto');
          ins.setAttribute('data-full-width-responsive', 'true');
          slot.appendChild(ins);
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } else if (c.network === 'ezoic' && c.ezoic_id) {
          slot.id = 'ezoic-pub-ad-placeholder-' + c.ezoic_id;
          window.ezstandalone = window.ezstandalone || { cmd: [] };
          window.ezstandalone.cmd.push(function () { try { window.ezstandalone.showAds(parseInt(c.ezoic_id, 10)); } catch (e) {} });
        } else if (c.network === 'custom' && c.custom_code) {
          slot.innerHTML = c.custom_code;
          // Re-execute any <script> tags in the custom snippet.
          Array.from(slot.querySelectorAll('script')).forEach(old => {
            const sc = document.createElement('script');
            if (old.src) sc.src = old.src; else sc.textContent = old.textContent;
            document.head.appendChild(sc);
          });
        } else {
          box.remove(); // enabled but not configured for this network
        }
      } catch (e) { /* never break the chat on an ad error */ }
    },
  };

  // ---- Support / donation promo (UPI / Razorpay QR after chat responses) ----
  const Support = {
    count: 0,
    async afterResponse(target) {
      let cfg;
      try { cfg = await Ads.config(); } catch (e) { return; }
      const s = cfg && cfg.support;
      if (!s || !s.enabled) return;
      if (!s.upi && !s.pay_url && !s.qr_url) return; // nothing configured yet
      this.count += 1;
      const freq = Math.max(1, parseInt(s.frequency, 10) || 3);
      if (this.count % freq !== 0) return;
      this.render(target, s);
    },
    render(target, s) {
      const kids = [
        h('div', { class: 'chat-support-head' }, [
          h('span', { class: 'cs-ico', html: icon('heart') }),
          h('strong', {}, s.title || 'Support Couponaut'),
        ]),
        h('p', { class: 'chat-support-msg' }, s.message || 'If Couponaut saved you money, consider chipping in so we can keep it fast & ad-light. 🙏'),
      ];
      if (s.qr_url) {
        kids.push(h('img', { class: 'chat-support-qr', src: s.qr_url, alt: 'Scan to pay (UPI / Razorpay)', loading: 'lazy' }));
        kids.push(h('div', { class: 'chat-support-scan' }, 'Scan with any UPI app to pay'));
      }
      const row = [];
      if (s.pay_url) row.push(h('a', { class: 'btn btn-primary btn-sm', href: s.pay_url, target: '_blank', rel: 'noopener' }, 'Support / Pay →'));
      if (s.upi) row.push(h('button', { class: 'btn btn-soft btn-sm', onclick: () => copyToClipboard(s.upi) },
        ['UPI: ' + s.upi + '  ', h('span', { style: 'width:13px;height:13px;display:inline-block;vertical-align:-2px;', html: icon('copy') })]));
      if (row.length) kids.push(h('div', { class: 'chat-support-actions' }, row));
      target.appendChild(h('div', { class: 'chat-support' }, kids));
    },
  };

  // ---- Custom promo banner (admin-defined; shown after chat responses) ----
  const Banner = {
    count: 0,
    async afterResponse(target) {
      let cfg;
      try { cfg = await Ads.config(); } catch (e) { return; }
      const b = cfg && cfg.banner;
      if (!b || !b.enabled) return;
      if (!b.html && !b.image && !b.text && !b.title) return; // nothing configured
      this.count += 1;
      const freq = Math.max(1, parseInt(b.frequency, 10) || 2);
      if (this.count % freq !== 0) return;
      this.render(target, b);
    },
    render(target, b) {
      // Raw HTML mode (full control) takes precedence if provided.
      if (b.html && b.html.trim()) {
        const box = h('div', { class: 'chat-banner chat-banner-raw' });
        box.innerHTML = b.html;
        // Re-execute any <script> tags the admin pasted.
        Array.from(box.querySelectorAll('script')).forEach(old => {
          const sc = document.createElement('script');
          if (old.src) sc.src = old.src; else sc.textContent = old.textContent;
          document.head.appendChild(sc);
        });
        target.appendChild(box);
        return;
      }
      // Structured mode: image + title + text + CTA link.
      const inner = [];
      if (b.image) inner.push(h('img', { class: 'chat-banner-img', src: b.image, alt: b.title || 'promo', loading: 'lazy' }));
      const body = [];
      if (b.title) body.push(h('div', { class: 'chat-banner-title' }, b.title));
      if (b.text) body.push(h('div', { class: 'chat-banner-text' }, b.text));
      if (b.cta || b.link) body.push(h('a', { class: 'btn btn-primary btn-sm chat-banner-cta', href: b.link || '#', target: '_blank', rel: 'sponsored noopener' }, b.cta || 'Learn more →'));
      inner.push(h('div', { class: 'chat-banner-body' }, body));
      const card = b.link
        ? h('a', { class: 'chat-banner chat-banner-link', href: b.link, target: '_blank', rel: 'sponsored noopener' }, inner)
        : h('div', { class: 'chat-banner' }, inner);
      target.appendChild(card);
    },
  };

  global.UI = { el, els, h, esc, toast, fmt, icon, modal, confirmDialog, setupCommandPalette, openCmdk, copyToClipboard, skeletonList, requireAuthRedirect, Ads, Support, Banner };
})(window);