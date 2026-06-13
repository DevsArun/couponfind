/* =====================================================================
   Couponaut — landing page
   chat-style conversational coupon search + features + pricing
   ===================================================================== */
(function () {
  const { h, el, fmt, icon, toast, copyToClipboard } = UI;

  el('#year').textContent = new Date().getFullYear();
  el('#pill-ico').innerHTML = icon('sparkles');
  el('#go').innerHTML = icon('send');
  ['t1', 't2', 't3'].forEach(id => el('#' + id).innerHTML = icon('check'));

  // ---------- Chat state ----------
  const thread = el('#thread');
  const input = el('#q');
  let totalFound = 0;
  let busy = false;

  function setFound(n) {
    totalFound += n;
    el('#found-counter').textContent = totalFound + ' coupon' + (totalFound === 1 ? '' : 's') + ' found';
  }

  function scrollDown() { thread.scrollTop = thread.scrollHeight; }

  function emptyState() {
    return h('div', { class: 'chat-empty', id: 'empty-state' }, [
      h('div', { class: 'brand-mark mx-auto', style: 'width:46px;height:46px;font-size:1.1rem;margin-bottom:0.9rem;' }, 'C'),
      h('div', { class: 'font-bold', style: 'font-size:1.05rem;color:var(--text);' }, 'Hey 👋 what are we saving on today?'),
      h('p', { class: 'text-sm mt-1', style: 'max-width:340px;margin:0.4rem auto 0;' }, 'Ask for any brand, deal or category. I understand typos, slang and intent.'),
    ]);
  }
  thread.appendChild(emptyState());

  function userRow(text) {
    return h('div', { class: 'chat-row user' }, [
      h('div', { class: 'chat-avatar user' }, 'You'),
      h('div', { class: 'chat-bubble' }, text),
    ]);
  }

  function botRow(contentNode, full) {
    return h('div', { class: 'chat-row bot' }, [
      h('div', { class: 'chat-avatar bot', html: icon('sparkles') }),
      h('div', { class: 'chat-bubble' + (full ? ' full' : '') }, contentNode),
    ]);
  }

  function typingRow() {
    return h('div', { class: 'chat-row bot', id: 'typing-row' }, [
      h('div', { class: 'chat-avatar bot', html: icon('sparkles') }),
      h('div', { class: 'chat-bubble' }, h('div', { class: 'typing' }, [h('span'), h('span'), h('span')])),
    ]);
  }

  // ---------- Examples ----------
  const examples = ['best amazon coupon today', 'hostinger discount', 'nike offer', 'best vpn deal', 'bst niek coupn'];
  const exWrap = el('#examples');
  examples.forEach(e => exWrap.appendChild(h('button', { class: 'chip', onclick: () => { input.value = e; send(); } }, e)));

  // ---------- Composer ----------
  function autogrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
  input.addEventListener('input', autogrow);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  el('#go').addEventListener('click', send);

  async function send() {
    const q = input.value.trim();
    if (!q || busy) return;
    busy = true; el('#go').disabled = true;

    const es = el('#empty-state'); if (es) es.remove();
    thread.appendChild(userRow(q));
    input.value = ''; autogrow();
    const typing = typingRow();
    thread.appendChild(typing);
    scrollDown();

    try {
      const data = await API.post('/search', { q });
      typing.remove();
      renderAnswer(q, data);
    } catch (e) {
      typing.remove();
      if (e.status === 402) {
        thread.appendChild(botRow(h('div', {}, [
          h('p', { style: 'margin:0;' }, "You've used all your free guest searches for now. "),
          h('p', { class: 'text-sm', style: 'margin:0.4rem 0 0;color:var(--muted);' }, e.message || ''),
          h('a', { href: '/register', class: 'btn btn-primary btn-sm mt-3', style: 'display:inline-flex;' }, 'Sign up free — 10/day'),
        ])));
      } else {
        thread.appendChild(botRow(h('span', {}, e.message || 'Something went wrong. Try again.')));
      }
    } finally {
      busy = false; el('#go').disabled = false;
      scrollDown(); input.focus();
    }
  }

  function answerLine(q, data) {
    const n = data.count || 0;
    const brand = data.intent && data.intent.merchant ? data.intent.merchant : null;
    if (!n) return `I couldn't find any live coupons for "${q}" right now. Try a brand name or a broader term.`;
    const what = brand ? `for ${brand}` : `matching "${q}"`;
    return `Found ${n} working coupon${n === 1 ? '' : 's'} ${what} in ${data.took_ms}ms. Here ${n === 1 ? 'is the best one' : 'are the best ones'} 👇`;
  }

  function renderAnswer(q, data) {
    setFound(data.count || 0);
    const block = h('div', {}, [ h('p', { style: 'margin:0 0 0.4rem;' }, answerLine(q, data)) ]);

    if (data.results && data.results.length) {
      const grid = h('div', { class: 'grid sm:grid-cols-2 gap-3 mt-2 stagger' });
      data.results.slice(0, 6).forEach(c => grid.appendChild(couponCard(c)));
      block.appendChild(grid);
    }
    block.appendChild(h('div', { class: 'chat-meta' },
      `via ${data.source}${data.cache_hit ? ' · cached' : ''}${data.intent && data.intent.confidence ? ' · intent ' + Math.round(data.intent.confidence * 100) + '%' : ''}` + ((data.results || []).some(r => r && r.is_affiliate) ? ' · some links are affiliate links (we may earn a commission)' : '')));
    thread.appendChild(botRow(block, true));
    UI.Ads.afterResponse(thread);
    scrollDown();
  }

  function couponCard(c) {
    const codeBtn = c.code
      ? h('button', { class: 'code-pill btn-soft', style: 'cursor:pointer;', onclick: () => { copyToClipboard(c.code); API.post('/coupons/' + c.id + '/use', {}).catch(() => {}); } },
          [c.code + '  ', h('span', { style: 'width:13px;height:13px;display:inline-block;vertical-align:-2px;', html: icon('copy') })])
      : h('a', { class: 'btn btn-soft btn-sm', href: '/api/go/' + c.id, target: '_blank', rel: 'sponsored nofollow noopener' }, 'Get deal →');

    return h('div', { class: 'card coupon-card p-4 flex flex-col gap-2' }, [
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', { class: 'badge badge-accent' }, fmt.discount(c)),
        h('span', { class: 'text-muted text-xs' }, c.merchant_name),
        c.is_affiliate ? h('span', { class: 'badge badge-muted', title: 'Affiliate partner deal' }, 'affiliate') : null,
      ]),
      h('h4', { class: 'font-bold', style: 'font-size:0.95rem;line-height:1.3;margin:0;' }, c.title),
      c.description ? h('p', { class: 'text-muted text-sm', style: 'margin:0;' }, c.description) : null,
      h('div', { class: 'flex items-center justify-between mt-1' }, [
        codeBtn,
        c.valid_until ? h('span', { class: 'text-xs text-muted' }, 'Ends ' + fmt.date(c.valid_until)) : h('span', {}),
      ]),
    ]);
  }

  // ---------- Features (bento) ----------
  const features = [
    { icon: 'sparkles', title: 'Typo-proof', desc: 'Misspell anything — "niek", "hostingr", "amazn". We resolve the real brand with fuzzy matching + AI.' },
    { icon: 'target', title: 'Intent-aware', desc: 'Detects the merchant, discount type and time intent ("today", "20% off") to rank precisely.' },
    { icon: 'bolt', title: 'Blazing fast', desc: 'Meilisearch + Redis cache deliver ranked results in well under 200ms.' },
    { icon: 'shield', title: 'Validated', desc: 'Codes are auto-validated, deduped and scored by reliability before you ever see them.' },
    { icon: 'layers', title: 'Best-first ranking', desc: 'A composite score blends freshness, success rate, popularity and real value.' },
    { icon: 'refresh', title: 'Always fresh', desc: 'A background engine continuously discovers new deals from official sources.' },
  ];
  const fg = el('#features-grid');
  features.forEach(f => fg.appendChild(h('div', { class: 'bento' }, [
    h('div', { class: 'feature-ico', html: icon(f.icon) }),
    h('h3', { class: 'font-bold mt-4', style: 'font-size:1.05rem;' }, f.title),
    h('p', { class: 'text-muted text-sm mt-2', style: 'line-height:1.55;' }, f.desc),
  ])));

  // ---------- Steps ----------
  const steps = [
    { n: '01', icon: 'globe', title: 'Discover', desc: 'Our engine crawls offer pages, RSS feeds & sitemaps around the clock.' },
    { n: '02', icon: 'sparkles', title: 'Structure', desc: 'AI extracts codes, validates them and removes duplicates.' },
    { n: '03', icon: 'layers', title: 'Rank', desc: 'Each deal is scored by freshness, reliability and value.' },
    { n: '04', icon: 'message', title: 'Ask', desc: 'You ask in plain language — we hand back the best deal instantly.' },
  ];
  const sg = el('#steps-grid');
  steps.forEach(s => sg.appendChild(h('div', { class: 'bento' }, [
    h('div', { class: 'flex items-center justify-between' }, [
      h('span', { class: 'feature-ico', style: 'width:38px;height:38px;', html: icon(s.icon) }),
      h('span', { class: 'mono text-muted', style: 'font-size:0.9rem;' }, s.n),
    ]),
    h('h3', { class: 'font-bold mt-4' }, s.title),
    h('p', { class: 'text-muted text-sm mt-1' }, s.desc),
  ])));

  // ---------- Pricing ----------
  (async function loadPlans() {
    const grid = el('#pricing-grid');
    try {
      const data = await API.get('/plans', { noAuth: true });
      grid.innerHTML = '';
      const highlight = 'pro';
      data.plans.forEach(p => {
        const featured = p.slug === highlight;
        const card = h('div', { class: 'card p-6 flex flex-col', style: featured ? 'border-color:var(--accent);box-shadow:0 0 0 1.5px var(--accent),var(--shadow);' : '' }, [
          featured ? h('div', { class: 'badge badge-accent mb-2', style: 'align-self:flex-start;' }, 'Most popular') : null,
          h('h3', { class: 'font-bold', style: 'font-size:1.1rem;' }, p.name),
          h('div', { class: 'mt-2 flex items-end gap-1' }, [
            h('span', { class: 'h-display', style: 'font-size:2rem;' }, p.price_cents === 0 ? 'Free' : fmt.money(p.price_cents, p.currency)),
            p.price_cents ? h('span', { class: 'text-muted text-sm', style: 'margin-bottom:6px;' }, '/' + p.interval) : null,
          ]),
          h('p', { class: 'text-muted text-sm mt-1' }, p.description || ''),
          h('ul', { class: 'mt-4 grid gap-2 text-sm', style: 'list-style:none;padding:0;flex:1;' },
            (p.features || []).map(f => h('li', { class: 'flex items-center gap-2 text-muted' }, [h('span', { style: 'width:15px;height:15px;display:inline-flex;color:var(--accent);', html: icon('check') }), f]))),
          h('a', { href: '/register', class: 'btn ' + (featured ? 'btn-primary' : 'btn-ghost') + ' mt-5' }, p.price_cents === 0 ? 'Start free' : 'Choose ' + p.name),
        ]);
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = '<div class="card p-6 text-muted">Pricing unavailable. Start the backend to load plans.</div>';
    }
  })();
})();


/* ---- Premium scroll-reveal motion ---- */
(function () {
  function setupReveal() {
    const sel = '#features .text-center, #how .text-center, #pricing .text-center, .bento, #pricing .card, .stats-band, .cta-card';
    document.querySelectorAll(sel).forEach(el => el.classList.add('reveal'));
    if (!('IntersectionObserver' in window)) { document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
  }
  setupReveal();
  // Re-run after async content (pricing) renders.
  setTimeout(setupReveal, 900);
})();
