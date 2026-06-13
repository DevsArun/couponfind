/* =====================================================================
   CouponFind — Super Admin Mission Control (hash-routed SPA)
   ===================================================================== */
(function () {
  const { el, els, h, esc, toast, fmt, icon, modal, confirmDialog } = UI;

  if (!UI.requireAuthRedirect()) return;

  let livePoll = null; // active interval for the Live Logs view

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'plans', label: 'Plans', icon: 'card' },
    { id: 'subscriptions', label: 'Subscriptions', icon: 'list' },
    { id: 'revenue', label: 'Revenue', icon: 'chart' },
    { id: 'payments', label: 'Payments', icon: 'card' },
    { id: 'gateway', label: 'Payment Gateway', icon: 'lock' },
    { id: 'coupons', label: 'Coupons', icon: 'tag' },
    { id: 'merchants', label: 'Merchants', icon: 'store' },
    { id: 'sources', label: 'Coupon Sources', icon: 'spider' },
    { id: 'search', label: 'Search Analytics', icon: 'search' },
    { id: 'ai', label: 'AI Control Center', icon: 'cpu' },
    { id: 'engine', label: 'Engine Control', icon: 'spider' },
    { id: 'live', label: 'Live Logs', icon: 'activity' },
    { id: 'flags', label: 'Feature Flags', icon: 'flag' },
    { id: 'logs', label: 'Logs & Audit', icon: 'activity' },
    { id: 'health', label: 'System Health', icon: 'shield' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'email', label: 'Email & SMTP', icon: 'message' },
  ];
  const nav = el('#nav');
  NAV.forEach(n => nav.appendChild(h('a', { class: 'nav-item', 'data-route': n.id, href: '#' + n.id }, [h('span', { html: icon(n.icon) }), h('span', {}, n.label)])));
  const setActive = (r) => els('.nav-item', nav).forEach(a => a.classList.toggle('active', a.getAttribute('data-route') === r));

  el('#logout').addEventListener('click', async () => { await API.logout(); location.href = '/login'; });

  UI.setupCommandPalette([
    ...NAV.map(n => ({ label: n.label, icon: n.icon, action: () => location.hash = n.id })),
    { label: 'Reindex Meilisearch', icon: 'box', action: () => API.post('/admin/engine/reindex', {}).then(() => toast('Reindex queued', 'ok')).catch(e => toast(e.message, 'err')) },
    { label: 'Force discovery crawl', icon: 'spider', action: () => API.post('/admin/engine/dispatch', { type: 'discover' }).then(() => toast('Discovery queued', 'ok')).catch(e => toast(e.message, 'err')) },
  ]);

  const view = el('#view');
  const setView = (n) => { view.innerHTML = ''; view.appendChild(n); };
  const loading = () => setView(UI.skeletonList(6, '64px'));
  const title = (t, s, a) => h('div', { class: 'flex items-end justify-between mb-6 fade-up' }, [h('div', {}, [h('h1', { class: 'h-display', style: 'font-size:1.6rem;' }, t), s ? h('p', { class: 'text-muted text-sm mt-1' }, s) : null]), a || h('div')]);
  const stat = (label, val, sub, ic) => h('div', { class: 'card p-5' }, [
    h('div', { class: 'flex items-center justify-between' }, [h('span', { class: 'text-muted text-xs uppercase tracking-wide' }, label), h('span', { class: 'feature-ico', style: 'width:30px;height:30px;', html: icon(ic) })]),
    h('div', { class: 'h-display mt-3', style: 'font-size:1.7rem;' }, val), sub ? h('div', { class: 'text-muted text-xs mt-1' }, sub) : null,
  ]);

  // ---- Tiny SVG bar chart ----
  function barChart(data, xKey, yKey, opts = {}) {
    const w = 640, hgt = 180, pad = 24;
    if (!data || !data.length) return h('div', { class: 'text-muted text-sm p-4' }, 'No data');
    const max = Math.max(...data.map(d => Number(d[yKey]) || 0), 1);
    const bw = (w - pad * 2) / data.length;
    const bars = data.map((d, i) => {
      const bh = ((Number(d[yKey]) || 0) / max) * (hgt - pad * 2);
      const x = pad + i * bw, y = hgt - pad - bh;
      return `<rect x="${x + 2}" y="${y}" width="${Math.max(2, bw - 6)}" height="${bh}" rx="3" fill="var(--accent)" opacity="0.85"><title>${esc(d[xKey])}: ${esc(d[yKey])}</title></rect>`;
    }).join('');
    return h('div', { class: 'card p-4', style: 'overflow:auto;' }, h('div', { html: `<svg viewBox="0 0 ${w} ${hgt}" style="width:100%;height:${hgt}px;">${bars}</svg>` }));
  }

  const Views = {
    async dashboard() {
      loading();
      const d = await API.get('/admin/dashboard');
      setView(h('div', {}, [
        title('Dashboard', 'Real-time platform overview'),
        h('div', { class: 'grid md:grid-cols-4 gap-4 stagger' }, [
          stat('Total users', fmt.num(d.users_total), fmt.num(d.users_active_24h) + ' active 24h', 'users'),
          stat('MRR', fmt.moneyVal(d.mrr), fmt.num(d.subscriptions) + ' active subs', 'chart'),
          stat('Active coupons', fmt.num(d.coupons_active), 'of ' + fmt.num(d.coupons_total) + ' total', 'tag'),
          stat('Searches 24h', fmt.num(d.searches_24h), d.avg_latency_ms + 'ms avg', 'search'),
        ]),
        h('div', { class: 'grid lg:grid-cols-2 gap-5 mt-6' }, [
          h('div', {}, [h('h3', { class: 'font-bold mb-3' }, 'Search volume (14d)'), barChart(d.search_volume, 'day', 'hits')]),
          (function () {
            const box = h('div', {}, [h('h3', { class: 'font-bold mb-3' }, 'Top queries (30d)')]);
            const c = h('div', { class: 'card', style: 'overflow:hidden;' });
            (d.top_queries || []).forEach(q => c.appendChild(h('div', { class: 'flex items-center justify-between p-3 border-b hairline', style: 'border-bottom-width:1px;' }, [h('span', { class: 'text-sm' }, q.term || '—'), h('span', { class: 'badge badge-accent' }, fmt.num(q.hits))])));
            if (!d.top_queries || !d.top_queries.length) c.appendChild(h('div', { class: 'p-4 text-muted text-sm' }, 'No searches yet.'));
            box.appendChild(c); return box;
          })(),
        ]),
      ]));
    },

    async users() {
      loading();
      const d = await API.get('/admin/users');
      const wrap = h('div', {}, [title('Users', fmt.num(d.total) + ' total')]);
      const table = h('table', { class: 'table' }, [
        h('thead', {}, h('tr', {}, ['User', 'Role', 'Status', 'Joined', 'Actions'].map(x => h('th', {}, x)))),
        h('tbody', {}, d.data.map(u => h('tr', {}, [
          h('td', {}, [h('div', { class: 'font-semibold' }, u.name), h('div', { class: 'text-muted text-xs' }, u.email)]),
          h('td', {}, h('span', { class: 'badge badge-blue' }, u.role_name)),
          h('td', {}, h('span', { class: 'badge ' + (u.status === 'active' ? 'badge-green' : 'badge-red') }, u.status)),
          h('td', { class: 'text-muted' }, fmt.date(u.created_at)),
          h('td', {}, h('div', { class: 'flex gap-2' }, [
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => setStatus(u) }, u.status === 'active' ? 'Suspend' : 'Activate'),
            h('button', { class: 'btn btn-soft btn-sm', onclick: () => assignPlan(u) }, 'Assign plan'),
            h('button', { class: 'btn btn-soft btn-sm', onclick: () => emailUser(u) }, 'Email'),
          ])),
        ]))),
      ]);
      wrap.appendChild(h('div', { class: 'card', style: 'overflow:auto;' }, table));
      setView(wrap);

      async function setStatus(u) {
        const status = u.status === 'active' ? 'suspended' : 'active';
        try { await API.post('/admin/users/' + u.id + '/status', { status }); toast('Updated', 'ok'); route(); } catch (e) { toast(e.message, 'err'); }
      }
      async function assignPlan(u) {
        const plans = (await API.get('/admin/plans')).plans;
        const sel = h('select', { class: 'input' }, plans.map(p => h('option', { value: p.id }, p.name)));
        const life = h('input', { type: 'checkbox' });
        const lim = h('input', { class: 'input', type: 'number', placeholder: 'override limit (optional)' });
        const win = h('select', { class: 'input' }, [h('option', { value: 'day' }, 'per day'), h('option', { value: 'month' }, 'per month')]);
        const body = h('div', { class: 'grid gap-3' }, [
          h('div', {}, [h('label', { class: 'label' }, 'Plan'), sel]),
          h('div', { class: 'grid grid-cols-2 gap-3' }, [h('div', {}, [h('label', { class: 'label' }, 'Override limit'), lim]), h('div', {}, [h('label', { class: 'label' }, 'Window'), win])]),
          h('label', { class: 'flex items-center gap-2 text-sm text-muted' }, [life, ' Lifetime access']),
          h('button', { class: 'btn btn-primary', onclick: async () => { try { await API.post('/admin/subscriptions/assign', { user_id: u.id, plan_id: sel.value, lifetime: life.checked, override_search_limit: lim.value || null, override_search_window: win.value }); toast('Plan assigned', 'ok'); m.close(); } catch (e) { toast(e.message, 'err'); } } }, 'Assign'),
        ]);
        const m = modal('Assign plan to ' + u.name, body);
      }

      function emailUser(u) {
        const subject = h('input', { class: 'input', placeholder: 'Subject' });
        const msg = h('textarea', { class: 'input', rows: '6', placeholder: 'Write your message…' });
        const body = h('div', { class: 'grid gap-3' }, [
          h('div', { class: 'text-muted text-sm' }, 'To: ' + u.name + ' <' + u.email + '>'),
          h('div', {}, [h('label', { class: 'label' }, 'Subject'), subject]),
          h('div', {}, [h('label', { class: 'label' }, 'Message'), msg]),
          h('button', { class: 'btn btn-primary', onclick: async () => { try { await API.post('/admin/users/' + u.id + '/email', { subject: subject.value, body: msg.value }); toast('Email sent', 'ok'); m.close(); } catch (e) { toast(e.message, 'err'); } } }, 'Send email'),
        ]);
        const m = modal('Email ' + u.name, body);
      }
    },

    async plans() {
      loading();
      const d = await API.get('/admin/plans');
      const wrap = h('div', {}, [title('Plans', 'Create, edit, and delete subscription plans', h('button', { class: 'btn btn-primary btn-sm', onclick: () => editPlan() }, '+ New plan'))]);
      const grid = h('div', { class: 'grid md:grid-cols-3 gap-4' });
      d.plans.forEach(p => grid.appendChild(h('div', { class: 'card p-5' }, [
        h('div', { class: 'flex items-center justify-between' }, [h('h3', { class: 'font-bold' }, p.name), h('span', { class: 'badge ' + (p.is_active ? 'badge-green' : 'badge-muted') }, p.is_active ? 'active' : 'off')]),
        h('div', { class: 'h-display mt-1', style: 'font-size:1.4rem;' }, p.price_cents === 0 ? 'Free' : fmt.money(p.price_cents, p.currency)),
        h('div', { class: 'text-muted text-xs' }, (p.search_limit === null ? '∞' : p.search_limit) + ' / ' + p.search_window + ' · ' + p.interval),
        h('div', { class: 'flex gap-2 mt-4' }, [
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editPlan(p) }, 'Edit'),
          h('button', { class: 'btn btn-danger btn-sm', onclick: () => confirmDialog('Delete ' + p.name + '?', async () => { await API.del('/admin/plans/' + p.id); toast('Deleted', 'ok'); route(); }) }, 'Delete'),
        ]),
      ])));
      wrap.appendChild(grid);
      setView(wrap);

      function editPlan(p) {
        const f = {};
        const field = (k, label, val, type = 'text') => { const i = h('input', { class: 'input', type, value: val ?? '' }); f[k] = i; return h('div', {}, [h('label', { class: 'label' }, label), i]); };
        const interval = h('select', { class: 'input' }, ['day', 'month', 'year', 'lifetime'].map(x => h('option', { value: x, selected: p && p.interval === x ? 'selected' : null }, x))); f.interval = interval;
        const win = h('select', { class: 'input' }, ['day', 'month'].map(x => h('option', { value: x, selected: p && p.search_window === x ? 'selected' : null }, x))); f.search_window = win;
        const body = h('div', { class: 'grid gap-3' }, [
          field('slug', 'Slug', p?.slug), field('name', 'Name', p?.name),
          h('div', { class: 'grid grid-cols-2 gap-3' }, [field('price_cents', 'Price (cents)', p?.price_cents ?? 0, 'number'), h('div', {}, [h('label', { class: 'label' }, 'Interval'), interval])]),
          h('div', { class: 'grid grid-cols-2 gap-3' }, [field('search_limit', 'Search limit', p?.search_limit ?? ''), h('div', {}, [h('label', { class: 'label' }, 'Window'), win])]),
          field('description', 'Description', p?.description),
          field('stripe_price_id', 'Stripe price ID', p?.stripe_price_id),
          field('razorpay_plan_id', 'Razorpay plan ID', p?.razorpay_plan_id),
          h('button', { class: 'btn btn-primary', onclick: save }, p ? 'Save plan' : 'Create plan'),
        ]);
        const m = modal(p ? 'Edit ' + p.name : 'New plan', body);
        async function save() {
          const payload = { slug: f.slug.value, name: f.name.value, price_cents: Number(f.price_cents.value) || 0, interval: f.interval.value, search_limit: f.search_limit.value === '' ? null : Number(f.search_limit.value), search_window: f.search_window.value, description: f.description.value, stripe_price_id: f.stripe_price_id.value, razorpay_plan_id: f.razorpay_plan_id.value };
          try { p ? await API.put('/admin/plans/' + p.id, payload) : await API.post('/admin/plans', payload); toast('Saved', 'ok'); m.close(); route(); } catch (e) { toast(e.message, 'err'); }
        }
      }
    },

    async subscriptions() {
      loading();
      const d = await API.get('/admin/subscriptions');
      setView(h('div', {}, [title('Subscriptions', d.subscriptions.length + ' recent'),
        h('div', { class: 'card', style: 'overflow:auto;' }, h('table', { class: 'table' }, [
          h('thead', {}, h('tr', {}, ['User', 'Plan', 'Gateway', 'Status', 'Renews', 'Override'].map(x => h('th', {}, x)))),
          h('tbody', {}, d.subscriptions.map(s => h('tr', {}, [
            h('td', {}, [h('div', { class: 'font-semibold' }, s.name), h('div', { class: 'text-muted text-xs' }, s.email)]),
            h('td', {}, s.plan_name), h('td', {}, h('span', { class: 'badge badge-muted' }, s.gateway)),
            h('td', {}, h('span', { class: 'badge ' + (s.status === 'active' ? 'badge-green' : 'badge-red') }, s.status)),
            h('td', { class: 'text-muted' }, s.is_lifetime ? 'Lifetime' : fmt.date(s.current_period_end)),
            h('td', {}, s.override_search_limit ? (s.override_search_limit + '/' + (s.override_search_window || 'day')) : '—'),
          ]))),
        ])),
      ]));
    },

    async revenue() {
      loading();
      const d = await API.get('/admin/analytics/revenue');
      setView(h('div', {}, [
        title('Revenue', 'Subscriptions & payments'),
        h('div', { class: 'grid md:grid-cols-3 gap-4 mb-6' }, [
          stat('MRR', fmt.moneyVal(d.mrr), 'monthly recurring', 'chart'),
          stat('Failed (30d)', fmt.num(d.failed_30d), 'payment failures', 'card'),
          stat('Plans', fmt.num((d.by_plan || []).length), 'with subscribers', 'list'),
        ]),
        h('h3', { class: 'font-bold mb-3' }, 'Daily revenue (30d)'),
        barChart((d.by_day || []).map(x => ({ day: x.day, revenue: x.revenue })), 'day', 'revenue'),
        h('h3', { class: 'font-bold mb-3 mt-6' }, 'Subscribers by plan'),
        h('div', { class: 'card', style: 'overflow:auto;' }, h('table', { class: 'table' }, [
          h('thead', {}, h('tr', {}, [h('th', {}, 'Plan'), h('th', {}, 'Subscribers')])),
          h('tbody', {}, (d.by_plan || []).map(p => h('tr', {}, [h('td', {}, p.name), h('td', {}, fmt.num(p.subscribers))]))),
        ])),
      ]));
    },

    async payments() {
      loading();
      const d = await API.get('/admin/payments');
      const wrap = h('div', {}, [title('Payments', d.payments.length + ' recent transactions')]);
      wrap.appendChild(h('div', { class: 'card', style: 'overflow:auto;' }, h('table', { class: 'table' }, [
        h('thead', {}, h('tr', {}, ['User', 'Gateway', 'Amount', 'Status', 'When', 'Actions'].map(x => h('th', {}, x)))),
        h('tbody', {}, d.payments.map(p => h('tr', {}, [
          h('td', {}, [h('div', { class: 'font-semibold' }, p.user_name || '—'), h('div', { class: 'text-muted text-xs' }, p.user_email || '')]),
          h('td', {}, h('span', { class: 'badge badge-muted' }, p.gateway)),
          h('td', {}, fmt.money(p.amount_cents, p.currency) + (p.refunded_cents > 0 ? ' (−' + fmt.money(p.refunded_cents, p.currency) + ')' : '')),
          h('td', {}, h('span', { class: 'badge ' + ({ succeeded: 'badge-green', failed: 'badge-red', refunded: 'badge-blue', partially_refunded: 'badge-blue' }[p.status] || 'badge-muted') }, p.status)),
          h('td', { class: 'text-muted' }, fmt.ago(p.created_at)),
          h('td', {}, p.status === 'succeeded'
            ? h('button', { class: 'btn btn-danger btn-sm', onclick: () => confirmDialog('Refund ' + fmt.money(p.amount_cents, p.currency) + ' to ' + (p.user_email || 'user') + '?', async () => { try { await API.post('/admin/payments/' + p.id + '/refund', {}); toast('Refund issued', 'ok'); route(); } catch (e) { toast(e.message, 'err'); } }) }, 'Refund')
            : h('span', { class: 'text-muted text-xs' }, '—')),
        ]))),
      ])));
      if (!d.payments.length) wrap.appendChild(h('div', { class: 'card p-10 text-center text-muted mt-2' }, 'No payments yet.'));
      setView(wrap);
    },

    async coupons() {
      loading();
      const d = await API.get('/admin/coupons');
      const wrap = h('div', {}, [title('Coupons', fmt.num(d.total) + ' total')]);
      wrap.appendChild(h('div', { class: 'card', style: 'overflow:auto;' }, h('table', { class: 'table' }, [
        h('thead', {}, h('tr', {}, ['Title', 'Merchant', 'Code', 'Discount', 'Status', 'Start', 'Expires', 'Actions'].map(x => h('th', {}, x)))),
        h('tbody', {}, d.data.map(c => h('tr', {}, [
          h('td', { style: 'max-width:260px;' }, c.title),
          h('td', {}, c.merchant_name),
          h('td', { class: 'mono' }, c.code || '—'),
          h('td', {}, h('span', { class: 'badge badge-accent' }, fmt.discount(c))),
          h('td', {}, h('span', { class: 'badge ' + (c.status === 'active' ? 'badge-green' : 'badge-muted') }, c.status)),
          h('td', { class: 'text-muted', style: 'white-space:nowrap;' }, c.starts_at ? c.starts_at.slice(0, 10) : '—'),
          h('td', { class: 'text-muted', style: 'white-space:nowrap;' }, c.valid_until ? c.valid_until.slice(0, 10) : '—'),
          h('td', {}, h('div', { class: 'flex gap-2' }, [
            h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await API.post('/admin/coupons/' + c.id + '/status', { status: c.status === 'active' ? 'unverified' : 'active' }); toast('Updated', 'ok'); route(); } }, c.status === 'active' ? 'Unverify' : 'Activate'),
            h('button', { class: 'btn btn-danger btn-sm', onclick: async () => { await API.post('/admin/coupons/' + c.id + '/expire', {}); toast('Expired', 'ok'); route(); } }, 'Expire'),
          ])),
        ]))),
      ])));
      setView(wrap);
    },

    async merchants() {
      loading();
      const d = await API.get('/admin/merchants');
      const wrap = h('div', {}, [title('Merchants', d.merchants.length + ' total', h('button', { class: 'btn btn-primary btn-sm', onclick: () => editMerchant() }, '+ New merchant'))]);
      const grid = h('div', { class: 'grid md:grid-cols-3 gap-4' });
      d.merchants.forEach(m => grid.appendChild(h('div', { class: 'card p-5' }, [
        h('div', { class: 'flex items-center justify-between' }, [h('h3', { class: 'font-bold' }, m.name), h('span', { class: 'badge ' + (m.is_active ? 'badge-green' : 'badge-muted') }, m.is_active ? 'active' : 'off')]),
        h('div', { class: 'text-muted text-xs mt-1' }, m.domain || m.website_url || ''),
        h('div', { class: 'text-muted text-xs mt-1' }, (m.category || 'uncategorized') + ' · pop ' + fmt.num(m.popularity)),
        h('div', { class: 'flex gap-2 mt-4' }, [
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editMerchant(m) }, 'Edit'),
          h('button', { class: 'btn btn-soft btn-sm', onclick: () => API.post('/admin/engine/dispatch', { type: 'crawl', payload: { merchant_id: m.id } }).then(() => toast('Crawl queued', 'ok')).catch(e => toast(e.message, 'err')) }, 'Force crawl'),
          h('button', { class: 'btn btn-danger btn-sm', onclick: () => confirmDialog('Delete ' + m.name + '?', async () => { await API.del('/admin/merchants/' + m.id); toast('Deleted', 'ok'); route(); }) }, 'Delete'),
        ]),
      ])));
      wrap.appendChild(grid);
      setView(wrap);

      function editMerchant(m) {
        const f = {};
        const field = (k, label, val) => { const i = h('input', { class: 'input', value: val ?? '' }); f[k] = i; return h('div', {}, [h('label', { class: 'label' }, label), i]); };
        const body = h('div', { class: 'grid gap-3' }, [
          field('slug', 'Slug', m?.slug), field('name', 'Name', m?.name),
          field('domain', 'Domain', m?.domain), field('website_url', 'Website URL', m?.website_url),
          field('category', 'Category', m?.category),
          h('button', { class: 'btn btn-primary', onclick: async () => { const payload = { slug: f.slug.value, name: f.name.value, domain: f.domain.value, website_url: f.website_url.value, category: f.category.value, is_active: 1 }; try { m ? await API.put('/admin/merchants/' + m.id, payload) : await API.post('/admin/merchants', payload); toast('Saved', 'ok'); mm.close(); route(); } catch (e) { toast(e.message, 'err'); } } }, 'Save'),
        ]);
        const mm = modal(m ? 'Edit ' + m.name : 'New merchant', body);
      }
    },

    async sources() {
      loading();
      const d = await API.get('/admin/sources');
      const wrap = h('div', {}, [title('Coupon Sources', 'Where the engine discovers coupons', h('button', { class: 'btn btn-primary btn-sm', onclick: addSource }, '+ Add source'))]);
      wrap.appendChild(h('div', { class: 'card', style: 'overflow:auto;' }, h('table', { class: 'table' }, [
        h('thead', {}, h('tr', {}, ['Type', 'URL', 'Merchant', 'Last crawl', 'Status', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, d.sources.map(s => h('tr', {}, [
          h('td', {}, h('span', { class: 'badge badge-blue' }, s.type)),
          h('td', { style: 'max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, s.url),
          h('td', {}, s.merchant_name || '—'),
          h('td', { class: 'text-muted' }, s.last_crawled_at ? fmt.ago(s.last_crawled_at) : 'never'),
          h('td', {}, h('span', { class: 'badge ' + (s.is_active ? 'badge-green' : 'badge-muted') }, s.is_active ? 'active' : 'off')),
          h('td', {}, h('button', { class: 'btn btn-danger btn-sm', onclick: async () => { await API.del('/admin/sources/' + s.id); toast('Removed', 'ok'); route(); } }, 'Delete')),
        ]))),
      ])));
      setView(wrap);

      function addSource() {
        const type = h('select', { class: 'input' }, ['offer_page', 'promo_page', 'rss', 'sitemap', 'newsletter', 'user_submission'].map(x => h('option', { value: x }, x)));
        const url = h('input', { class: 'input', placeholder: 'https://merchant.com/deals' });
        const body = h('div', { class: 'grid gap-3' }, [
          h('div', {}, [h('label', { class: 'label' }, 'Type'), type]),
          h('div', {}, [h('label', { class: 'label' }, 'URL'), url]),
          h('button', { class: 'btn btn-primary', onclick: async () => { try { await API.post('/admin/sources', { type: type.value, url: url.value }); toast('Added', 'ok'); m.close(); route(); } catch (e) { toast(e.message, 'err'); } } }, 'Add source'),
        ]);
        const m = modal('Add coupon source', body);
      }
    },

    async search() {
      loading();
      const d = await API.get('/admin/analytics/search');
      setView(h('div', {}, [
        title('Search Analytics', 'Query volume & quality'),
        h('div', { class: 'grid md:grid-cols-3 gap-4 mb-6' }, [
          stat('Avg latency', d.avg_latency + 'ms', 'last 30 days', 'activity'),
          stat('Zero-result', fmt.num(d.zero_result), 'searches (30d)', 'search'),
          stat('Top terms', fmt.num((d.top_queries || []).length), 'tracked', 'tag'),
        ]),
        h('h3', { class: 'font-bold mb-3' }, 'Daily volume (30d)'),
        barChart(d.daily_volume, 'day', 'hits'),
        h('h3', { class: 'font-bold mb-3 mt-6' }, 'Top queries'),
        h('div', { class: 'card', style: 'overflow:auto;' }, h('table', { class: 'table' }, [
          h('thead', {}, h('tr', {}, [h('th', {}, 'Term'), h('th', {}, 'Hits')])),
          h('tbody', {}, (d.top_queries || []).map(q => h('tr', {}, [h('td', {}, q.term || '—'), h('td', {}, fmt.num(q.hits))]))),
        ])),
      ]));
    },

    async ai() {
      loading();
      const d = await API.get('/admin/ai/providers');
      const wrap = h('div', {}, [title('AI Control Center', 'Provider fallback chain: Groq → Gemini → OpenAI')]);
      const grid = h('div', { class: 'grid md:grid-cols-3 gap-4' });
      d.providers.forEach(p => grid.appendChild(h('div', { class: 'card p-5' }, [
        h('div', { class: 'flex items-center justify-between' }, [h('h3', { class: 'font-bold' }, p.name), h('span', { class: 'badge ' + (p.is_enabled ? 'badge-green' : 'badge-muted') }, p.is_enabled ? 'enabled' : 'disabled')]),
        h('div', { class: 'text-muted text-xs mt-1' }, 'priority ' + p.priority + ' · ' + (p.model || 'default model')),
        p.last_error ? h('div', { class: 'badge badge-red mt-2' }, 'err: ' + p.last_error.slice(0, 40)) : (p.last_ok_at ? h('div', { class: 'text-muted text-xs mt-2' }, 'last ok ' + fmt.ago(p.last_ok_at)) : null),
        h('div', { class: 'flex gap-2 mt-4' }, [
          h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await API.put('/admin/ai/providers/' + p.id, { is_enabled: !p.is_enabled }); toast('Updated', 'ok'); route(); } }, p.is_enabled ? 'Disable' : 'Enable'),
          h('button', { class: 'btn btn-soft btn-sm', onclick: () => editPriority(p) }, 'Set priority'),
        ]),
      ])));
      wrap.appendChild(grid);
      setView(wrap);
      function editPriority(p) {
        const pr = h('input', { class: 'input', type: 'number', value: p.priority });
        const md = h('input', { class: 'input', value: p.model || '' });
        const body = h('div', { class: 'grid gap-3' }, [h('div', {}, [h('label', { class: 'label' }, 'Priority (lower = first)'), pr]), h('div', {}, [h('label', { class: 'label' }, 'Model'), md]), h('button', { class: 'btn btn-primary', onclick: async () => { await API.put('/admin/ai/providers/' + p.id, { is_enabled: p.is_enabled, priority: Number(pr.value), model: md.value }); toast('Saved', 'ok'); m.close(); route(); } }, 'Save')]);
        const m = modal('Configure ' + p.name, body);
      }
    },

    async engine() {
      loading();
      const [ctrl, d] = await Promise.all([API.get('/admin/engine/control'), API.get('/admin/engine/jobs')]);
      const s = ctrl.stats || {};
      const statusBadge = h('span', { class: 'badge ' + (ctrl.enabled ? 'badge-green' : 'badge-red') }, ctrl.enabled ? 'Running 24/7' : 'Paused');
      const toggle = h('button', { class: 'btn ' + (ctrl.enabled ? 'btn-danger' : 'btn-primary') + ' btn-sm', onclick: () => setEngine(!ctrl.enabled) }, ctrl.enabled ? 'Emergency stop' : 'Start engine');
      const actions = h('div', { class: 'flex flex-wrap gap-2' }, [
        ['discover', 'Discover now'], ['crawl', 'Crawl'], ['validate', 'Validate'], ['score', 'Score'], ['sync', 'Sync index'],
      ].map(([t, label]) => h('button', { class: 'btn btn-soft btn-sm', onclick: () => API.post('/admin/engine/dispatch', { type: t }).then(() => { toast(label + ' queued', 'ok'); route(); }).catch(e => toast(e.message, 'err')) }, label)));
      const wrap = h('div', {}, [
        title('Engine Control', 'Crawler · Validation · Indexer — runs 24/7 automatically', h('div', { class: 'flex items-center gap-2' }, [statusBadge, toggle])),
        h('div', { class: 'grid md:grid-cols-4 gap-4 stagger mb-6' }, [
          stat('Found today', fmt.num(s.found_today), 'new coupons discovered', 'tag'),
          stat('Removed today', fmt.num(s.removed_today), 'expired / rejected', 'flag'),
          stat('Active coupons', fmt.num(s.active), 'of ' + fmt.num(s.total) + ' total', 'bolt'),
          stat('Active sources', fmt.num(s.active_sources), (s.queued_jobs || 0) + ' queued · ' + (s.running_jobs || 0) + ' running', 'spider'),
        ]),
        !ctrl.enabled ? h('div', { class: 'card p-4 mb-5', style: 'border-color:var(--red);' }, [h('div', { class: 'flex items-center gap-2' }, [h('span', { class: 'dot bad' }), h('span', { class: 'font-semibold' }, 'Engine is paused'), h('span', { class: 'text-muted text-sm' }, '— no new coupons will be discovered until you start it again.')])]) : null,
        h('div', { class: 'card p-5 mb-5' }, [
          h('h3', { class: 'font-bold mb-3' }, 'Run jobs now'),
          actions,
          h('div', { class: 'flex flex-wrap gap-2 mt-4 pt-4 border-t hairline', style: 'border-top-width:1px;' }, [
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => purge('demo') }, 'Delete demo coupons'),
            h('button', { class: 'btn btn-danger btn-sm', onclick: () => confirmDialog('Delete ALL coupons? This permanently clears the catalog (re-discovery will repopulate it).', () => purge('all')) }, 'Purge all coupons'),
          ]),
        ]),
        h('h3', { class: 'font-bold mb-3' }, 'Recent jobs'),
        h('div', { class: 'card', style: 'overflow:auto;' }, h('table', { class: 'table' }, [
          h('thead', {}, h('tr', {}, ['#', 'Type', 'Status', 'Attempts', 'Created'].map(x => h('th', {}, x)))),
          h('tbody', {}, d.jobs.map(j => h('tr', {}, [
            h('td', { class: 'mono' }, '#' + j.id), h('td', {}, h('span', { class: 'badge badge-blue' }, j.type)),
            h('td', {}, h('span', { class: 'badge ' + ({ done: 'badge-green', failed: 'badge-red', running: 'badge-accent' }[j.status] || 'badge-muted') }, j.status)),
            h('td', {}, j.attempts), h('td', { class: 'text-muted' }, fmt.ago(j.created_at)),
          ]))),
        ])),
      ]);
      setView(wrap);

      async function setEngine(on) {
        try { await API.post('/admin/engine/control', { enabled: on }); toast(on ? 'Engine resumed' : 'Engine paused (emergency stop)', 'ok'); route(); } catch (e) { toast(e.message, 'err'); }
      }
      async function purge(scope) {
        try { const r = await API.post('/admin/coupons/purge', { scope }); toast('Removed ' + r.deleted + ' coupon(s)', 'ok'); route(); } catch (e) { toast(e.message, 'err'); }
      }
    },

    async flags() {
      loading();
      const d = await API.get('/admin/flags');
      const wrap = h('div', {}, [title('Feature Flags', 'Toggle platform features')]);
      const list = h('div', { class: 'card', style: 'overflow:hidden;' });
      d.flags.forEach(f => list.appendChild(h('div', { class: 'flex items-center justify-between p-4 border-b hairline', style: 'border-bottom-width:1px;' }, [
        h('div', {}, [h('div', { class: 'font-semibold' }, f.name), h('div', { class: 'text-muted text-xs mt-1' }, f.description || f.key)]),
        h('button', { class: 'btn ' + (f.is_enabled ? 'btn-primary' : 'btn-ghost') + ' btn-sm', onclick: async () => { await API.put('/admin/flags/' + f.key, { is_enabled: !f.is_enabled }); toast('Updated', 'ok'); route(); } }, f.is_enabled ? 'On' : 'Off'),
      ])));
      wrap.appendChild(list);
      setView(wrap);
    },

    async logs() {
      loading();
      const [audit, api] = await Promise.all([API.get('/admin/logs/audit'), API.get('/admin/logs/api')]);
      setView(h('div', {}, [
        title('Logs & Audit', 'Security and request trails'),
        h('h3', { class: 'font-bold mb-3' }, 'Audit log'),
        h('div', { class: 'card mb-6', style: 'overflow:auto;max-height:340px;' }, h('table', { class: 'table' }, [
          h('thead', {}, h('tr', {}, ['Action', 'Actor', 'Entity', 'When'].map(x => h('th', {}, x)))),
          h('tbody', {}, audit.logs.map(l => h('tr', {}, [h('td', {}, h('span', { class: 'badge badge-muted' }, l.action)), h('td', {}, l.actor_email || 'system'), h('td', { class: 'text-muted' }, (l.entity_type || '') + ' ' + (l.entity_id || '')), h('td', { class: 'text-muted' }, fmt.ago(l.created_at))]))),
        ])),
        h('h3', { class: 'font-bold mb-3' }, 'API log'),
        h('div', { class: 'card', style: 'overflow:auto;max-height:340px;' }, h('table', { class: 'table' }, [
          h('thead', {}, h('tr', {}, ['Method', 'Path', 'Status', 'Time', 'When'].map(x => h('th', {}, x)))),
          h('tbody', {}, api.logs.map(l => h('tr', {}, [h('td', {}, h('span', { class: 'badge badge-blue' }, l.method)), h('td', { class: 'mono', style: 'font-size:0.8rem;' }, l.path), h('td', {}, h('span', { class: 'badge ' + (l.status_code < 400 ? 'badge-green' : 'badge-red') }, l.status_code)), h('td', {}, l.took_ms + 'ms'), h('td', { class: 'text-muted' }, fmt.ago(l.created_at))]))),
        ])),
      ]));
    },

    async health() {
      loading();
      const d = await API.get('/admin/health');
      const svc = (label, ok) => h('div', { class: 'card p-5 flex items-center justify-between' }, [h('span', { class: 'font-semibold' }, label), h('span', { class: 'flex items-center gap-2' }, [h('span', { class: 'dot ' + (ok ? 'ok' : 'bad') }), h('span', { class: 'text-sm ' + (ok ? 'text-accent' : ''), style: ok ? '' : 'color:var(--red);' }, ok ? 'healthy' : 'down')])]);
      setView(h('div', {}, [
        title('System Health', 'Live infrastructure status'),
        h('div', { class: 'grid md:grid-cols-3 gap-4' }, [svc('MySQL', d.database), svc('Redis', d.redis), svc('Meilisearch', d.meilisearch)]),
        h('div', { class: 'grid md:grid-cols-3 gap-4 mt-4' }, [
          stat('Queued jobs', fmt.num(d.queued_jobs), 'engine queue', 'list'),
          stat('Failed jobs', fmt.num(d.failed_jobs), 'need attention', 'flag'),
          stat('PHP', d.php_version, 'runtime', 'cpu'),
        ]),
      ]));
    },

    async gateway() {
      loading();
      const d = await API.get('/admin/payment-gateway');
      const wrap = h('div', {}, [title('Payment Gateway', 'Pick the gateway that processes payments. Switch anytime — users always check out through the active one.')]);

      const grid = h('div', { class: 'grid md:grid-cols-2 gap-4' });
      [['stripe', 'Stripe'], ['razorpay', 'Razorpay']].forEach(([key, label]) => {
        const g = d.gateways[key] || {};
        const active = d.active === key;
        grid.appendChild(h('div', { class: 'card p-5', style: active ? 'border-color:var(--accent);box-shadow:0 0 0 1.5px var(--accent);' : '' }, [
          h('div', { class: 'flex items-center justify-between' }, [
            h('div', { class: 'flex items-center gap-2' }, [h('span', { class: 'feature-ico', style: 'width:34px;height:34px;', html: icon('card') }), h('h3', { class: 'font-bold', style: 'font-size:1.15rem;' }, label)]),
            active ? h('span', { class: 'badge badge-accent' }, 'Active') : h('button', { class: 'btn btn-soft btn-sm', onclick: () => setActive(key) }, 'Make active'),
          ]),
          h('div', { class: 'flex items-center gap-2 mt-3' }, [
            h('span', { class: 'dot ' + (g.configured ? 'ok' : 'bad') }),
            h('span', { class: 'text-sm text-muted' }, g.configured ? 'Configured & ready' : 'Missing API keys'),
          ]),
        ]));
      });
      wrap.appendChild(grid);

      // ---- Credentials (saved into settings; blank = keep existing) ----
      const f = {};
      const keyField = (k, label, ph) => { const i = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: ph || 'leave blank to keep current' }); f[k] = i; return h('div', {}, [h('label', { class: 'label' }, label), i]); };
      const form = h('div', { class: 'card p-5 mt-5' }, [
        h('h3', { class: 'font-bold mb-1' }, 'API credentials'),
        h('p', { class: 'text-muted text-sm mb-4' }, 'Stored securely server-side. Leave a field blank to keep the current value.'),
        h('div', { class: 'grid md:grid-cols-2 gap-5' }, [
          h('div', { class: 'grid gap-3' }, [h('div', { class: 'font-semibold text-sm' }, 'Stripe'), keyField('stripe_secret_key', 'Secret key (sk_…)'), keyField('stripe_webhook_secret', 'Webhook signing secret (whsec_…)')]),
          h('div', { class: 'grid gap-3' }, [h('div', { class: 'font-semibold text-sm' }, 'Razorpay'), keyField('razorpay_key_id', 'Key ID (rzp_…)'), keyField('razorpay_key_secret', 'Key secret'), keyField('razorpay_webhook_secret', 'Webhook secret')]),
        ]),
        h('button', { class: 'btn btn-primary mt-5', onclick: saveKeys }, 'Save credentials'),
      ]);
      wrap.appendChild(form);
      setView(wrap);

      async function setActive(key) {
        try { await API.put('/admin/payment-gateway', { active: key }); toast('Now using ' + key, 'ok'); route(); } catch (e) { toast(e.message, 'err'); }
      }
      async function saveKeys() {
        const payload = { active: d.active };
        Object.keys(f).forEach(k => { if (f[k].value.trim()) payload[k] = f[k].value.trim(); });
        try { await API.put('/admin/payment-gateway', payload); toast('Credentials saved', 'ok'); route(); } catch (e) { toast(e.message, 'err'); }
      }
    },

    async live() {
      const wrap = h('div', {}, [
        title('Live Logs', 'Realtime view of what the backend engine is doing', h('div', { class: 'flex items-center gap-2' }, [
          h('span', { id: 'live-status', class: 'badge badge-muted' }, 'connecting…'),
          h('button', { id: 'live-toggle', class: 'btn btn-ghost btn-sm', onclick: () => toggle() }, 'Pause'),
        ])),
        h('div', { class: 'grid grid-cols-2 md:grid-cols-5 gap-3 mb-4', id: 'live-stats' }),
        h('div', { class: 'card', style: 'overflow:hidden;' }, [
          h('div', { class: 'flex items-center justify-between px-4 py-2 border-b hairline', style: 'border-bottom-width:1px;' }, [
            h('span', { class: 'font-bold text-sm' }, 'Console'),
            h('span', { id: 'live-clock', class: 'text-muted text-xs mono' }, ''),
          ]),
          h('div', { id: 'live-console', class: 'live-console' }, h('div', { class: 'live-line text-muted' }, 'connecting…')),
        ]),
      ]);
      setView(wrap);

      let running = true;
      const tm = (s) => { if (!s) return '--:--:--'; const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('T') ? '' : 'Z')); return isNaN(d) ? '--:--:--' : d.toLocaleTimeString('en-GB'); };
      const statusCls = (st) => ({ done: 'ls-ok', failed: 'ls-bad', running: 'ls-run', queued: 'ls-queue' }[st] || '');

      async function tick() {
        try {
          const d = await API.get('/admin/activity');
          const sEl = el('#live-status'); if (sEl) { sEl.className = 'badge ' + (d.enabled ? 'badge-green' : 'badge-red'); sEl.textContent = d.enabled ? '● live' : '● paused'; }
          const ck = el('#live-clock'); if (ck) ck.textContent = 'server ' + d.server_time;
          const st = el('#live-stats'); if (st) {
            st.innerHTML = '';
            [['Found today', d.found_today], ['Removed today', d.removed_today], ['Active', d.active], ['Queued', d.queued_jobs], ['Running', d.running_jobs]]
              .forEach(([l, v]) => st.appendChild(h('div', { class: 'card p-3 text-center' }, [h('div', { class: 'h-display', style: 'font-size:1.3rem;' }, fmt.num(v)), h('div', { class: 'text-muted text-xs mt-1' }, l)])));
          }
          const lines = [];
          (d.jobs || []).forEach(j => lines.push({ t: j.finished_at || j.started_at || j.created_at, html: `<span class="lt">[${tm(j.finished_at || j.started_at || j.created_at)}]</span> <span class="lj">JOB#${j.id}</span> ${esc(j.type)} → <span class="${statusCls(j.status)}">${esc(j.status)}</span>` + (j.error ? ` <span class="le">${esc(j.error)}</span>` : '') }));
          (d.recent_coupons || []).forEach(c => lines.push({ t: c.created_at, html: `<span class="lt">[${tm(c.created_at)}]</span> <span class="lc">FOUND</span> "${esc(c.title)}" <span class="text-muted">(${esc(c.merchant)})</span>` + (c.code ? ` <span class="lcode">${esc(c.code)}</span>` : '') }));
          lines.sort((a, b) => new Date(b.t) - new Date(a.t));
          const con = el('#live-console');
          if (con) con.innerHTML = lines.length ? lines.map(l => `<div class="live-line">${l.html}</div>`).join('') : '<div class="live-line text-muted">No activity yet — add a coupon source and run discovery from Engine Control.</div>';
        } catch (e) {
          const sEl = el('#live-status'); if (sEl) { sEl.className = 'badge badge-red'; sEl.textContent = 'disconnected'; }
        }
      }
      function toggle() {
        running = !running;
        const b = el('#live-toggle'); if (b) b.textContent = running ? 'Pause' : 'Resume';
        if (running) { tick(); livePoll = setInterval(tick, 3000); }
        else if (livePoll) { clearInterval(livePoll); livePoll = null; }
      }
      tick();
      livePoll = setInterval(tick, 3000);
    },

    async email() {
      loading();
      const d = await API.get('/admin/settings');
      const map = {}; (d.settings || []).forEach(s => { map[s.key] = s.value; });
      const f = {};
      const field = (k, label, ph, type = 'text') => { const i = h('input', { class: 'input', type, value: map[k] || '', placeholder: ph, autocomplete: 'off' }); f[k] = i; return h('div', {}, [h('label', { class: 'label' }, label), i]); };
      const wrap = h('div', {}, [
        title('Email & SMTP', 'Sender + SMTP server used for verification, welcome and all outbound email'),
        h('div', { class: 'card p-6 grid gap-5', style: 'max-width:680px;' }, [
          h('div', {}, [h('h3', { class: 'font-bold' }, 'System sender (verification & welcome)'), h('p', { class: 'text-muted text-sm mt-1' }, 'Used for account verification, welcome and system emails.')]),
          h('div', { class: 'grid sm:grid-cols-2 gap-4' }, [field('mail_from_address', 'From address', 'no-reply@yourdomain.com'), field('mail_from_name', 'From name', 'CouponFind')]),
          h('div', { class: 'border-t hairline', style: 'border-top-width:1px;padding-top:1rem;' }, [h('h3', { class: 'font-bold' }, 'Outreach sender (admin → user emails)'), h('p', { class: 'text-muted text-sm mt-1' }, 'Used when you email a user from the panel. Leave blank to reuse the system sender.')]),
          h('div', { class: 'grid sm:grid-cols-2 gap-4' }, [field('mail_user_from_address', 'From address', 'team@yourdomain.com'), field('mail_user_from_name', 'From name', 'CouponFind Team')]),
          h('div', { class: 'border-t hairline', style: 'border-top-width:1px;padding-top:1rem;' }, [h('h3', { class: 'font-bold' }, 'SMTP server')]),
          h('div', { class: 'grid sm:grid-cols-2 gap-4' }, [field('mail_host', 'Host', 'smtp.gmail.com'), field('mail_port', 'Port', '587')]),
          h('div', { class: 'grid sm:grid-cols-2 gap-4' }, [field('mail_username', 'Username', 'you@gmail.com'), field('mail_password', 'Password / app password', 'leave blank to keep current', 'password')]),
          field('mail_encryption', 'Encryption', 'tls / ssl / none'),
          h('div', { class: 'flex items-center gap-3 mt-1' }, [
            h('button', { class: 'btn btn-primary', onclick: save }, 'Save email settings'),
            h('span', { class: 'text-muted text-sm' }, map['mail_host'] ? 'SMTP configured ✓' : 'Not configured yet'),
          ]),
        ]),
      ]);
      setView(wrap);

      async function save() {
        try {
          for (const k of Object.keys(f)) {
            const v = f[k].value;
            if (k === 'mail_password' && v.trim() === '') continue; // keep existing secret
            await API.put('/admin/settings/' + encodeURIComponent(k), { value: v });
          }
          toast('Email settings saved', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      }
    },

    async settings() {
      loading();
      const d = await API.get('/admin/settings');
      const wrap = h('div', {}, [title('Settings', 'Platform configuration')]);
      const list = h('div', { class: 'card p-5 grid gap-4' });
      d.settings.forEach(s => {
        const input = h('input', { class: 'input', value: s.value ?? '' });
        list.appendChild(h('div', { class: 'flex items-end gap-3' }, [
          h('div', { style: 'flex:1;' }, [h('label', { class: 'label' }, s.key), input]),
          h('button', { class: 'btn btn-soft btn-sm', onclick: async () => { await API.put('/admin/settings/' + encodeURIComponent(s.key), { value: input.value }); toast('Saved', 'ok'); } }, 'Save'),
        ]));
      });
      wrap.appendChild(list);
      setView(wrap);
    },
  };

  function parseHash() { const raw = (location.hash || '#dashboard').slice(1); const [r, qs] = raw.split('?'); return { route: r || 'dashboard', params: new URLSearchParams(qs || '') }; }
  async function route() {
    const { route: r, params } = parseHash();
    if (livePoll) { clearInterval(livePoll); livePoll = null; }
    setActive(r);
    try { await (Views[r] || Views.dashboard)(params); }
    catch (e) {
      if (e.status === 401) { await API.logout(); location.href = '/login'; return; }
      if (e.status === 403) { setView(h('div', { class: 'card p-10 text-center' }, [h('h2', { class: 'h-display' }, 'Admin access required'), h('p', { class: 'text-muted mt-2' }, 'Your account is not an administrator.'), h('a', { href: '/app', class: 'btn btn-primary mt-4', style: 'display:inline-flex;' }, 'Go to app')])); return; }
      setView(h('div', { class: 'card p-8 text-center' }, [h('p', { class: 'font-semibold' }, 'Failed to load'), h('p', { class: 'text-muted text-sm mt-1' }, e.message)]));
    }
  }
  window.addEventListener('hashchange', route);

  (async function boot() {
    let me;
    try { me = await API.me(); } catch (e) { await API.logout(); location.href = '/login'; return; }
    if (!me.is_admin) { location.href = '/app/'; return; }
    el('#user-name').textContent = me.name;
    el('#avatar').textContent = (me.name || 'A')[0].toUpperCase();
    // Health indicator
    try { const hd = await API.get('/admin/health'); const ok = hd.database && hd.redis; el('#health-dot').className = 'dot ' + (ok ? 'ok' : 'bad'); el('#health-text').textContent = ok ? 'All systems operational' : 'Degraded'; }
    catch (e) { el('#health-dot').className = 'dot bad'; el('#health-text').textContent = 'Unknown'; }
    if (!location.hash) location.hash = 'dashboard';
    route();
  })();
})();
