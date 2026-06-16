/* =====================================================================
   Couponaut — dedicated /ai search page
   Full-screen, mobile-first conversational coupon search. Works for guests
   and logged-in users (the /search endpoint handles optional auth).
   ===================================================================== */
(function () {
  const { h, el, fmt, icon, toast, copyToClipboard } = UI;

  el('#go').innerHTML = icon('send');
  el('#back-ico').innerHTML = icon('arrowRight'); // rotated via CSS to point back

  // Auth-aware top-right link.
  const cta = el('#cta-link');
  if (cta) {
    if (API.isAuthed()) { cta.textContent = 'Dashboard'; cta.href = '/app'; }
    else { cta.textContent = 'Sign in'; cta.href = '/login'; }
  }

  const thread = el('#thread');
  const input = el('#q');
  let totalFound = 0;
  let busy = false;

  function setFound(n) {
    totalFound += n;
    el('#found-counter').textContent = totalFound + ' found';
  }
  function scrollDown() { thread.scrollTop = thread.scrollHeight; }

  function emptyState() {
    return h('div', { class: 'chat-empty', id: 'empty-state' }, [
      h('div', { class: 'brand-mark mx-auto', style: 'width:48px;height:48px;font-size:1.15rem;margin-bottom:0.9rem;' }, 'C'),
      h('div', { class: 'font-bold', style: 'font-size:1.1rem;color:var(--text);' }, 'Hey 👋 what are we saving on today?'),
      h('p', { class: 'text-sm mt-1', style: 'max-width:340px;margin:0.5rem auto 0;color:var(--muted);' }, 'Ask for any brand, deal or category. I understand typos, slang and intent.'),
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

  // ---- Coupon card (always surfaces the affiliate/store link) ----
  function couponCard(c) {
    const cid = c.id || c.coupon_id;
    const shopLink = c.landing_url ? h('a', {
      class: 'btn btn-soft btn-sm', href: '/api/go/' + cid, target: '_blank', rel: 'sponsored nofollow noopener',
      title: c.is_affiliate ? 'Affiliate link — opens the store (we may earn a commission)' : 'Open the store',
    }, c.code ? 'Shop now →' : 'Get deal →') : null;
    const codeBtn = c.code
      ? h('button', { class: 'code-pill btn-soft', style: 'cursor:pointer;', onclick: () => { copyToClipboard(c.code); API.post('/coupons/' + cid + '/use', {}).catch(() => {}); } },
          [c.code + '  ', h('span', { style: 'width:13px;height:13px;display:inline-block;vertical-align:-2px;', html: icon('copy') })])
      : null;
    return h('div', { class: 'card coupon-card p-4 flex flex-col gap-2' }, [
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', { class: 'badge badge-accent' }, fmt.discount(c)),
        h('span', { class: 'text-muted text-xs' }, c.merchant_name),
        c.is_affiliate ? h('span', { class: 'badge badge-muted', title: 'Affiliate partner deal' }, 'affiliate') : null,
      ]),
      h('h4', { class: 'font-bold', style: 'font-size:0.95rem;line-height:1.3;margin:0;' }, c.title),
      c.description ? h('p', { class: 'text-muted text-sm', style: 'margin:0;' }, c.description) : null,
      h('div', { class: 'flex items-center justify-between mt-1' }, [
        h('div', { class: 'flex items-center gap-2 flex-wrap' }, [codeBtn, shopLink]),
        c.valid_until ? h('span', { class: 'text-xs text-muted' }, 'Ends ' + fmt.date(c.valid_until)) : h('span', {}),
      ]),
    ]);
  }

  // ---- Examples ----
  const examples = ['best amazon coupon today', 'hostinger discount', 'nike offer', 'best vpn deal', 'adidas promo code'];
  const exWrap = el('#examples');
  examples.forEach(e => exWrap.appendChild(h('button', { class: 'chip', onclick: () => { input.value = e; send(); } }, e)));

  // ---- Composer ----
  function autogrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
  input.addEventListener('input', autogrow);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  el('#go').addEventListener('click', send);

  function answerLine(q, data) {
    const n = data.count || 0;
    const brand = data.intent && data.intent.merchant ? data.intent.merchant : null;
    if (!n) return `I couldn't find any live coupons for "${q}" right now. Try a brand name or a broader term.`;
    const what = brand ? `for ${brand}` : `matching "${q}"`;
    return `Found ${n} working coupon${n === 1 ? '' : 's'} ${what} in ${data.took_ms}ms. Here ${n === 1 ? 'is the best one' : 'are the best ones'} 👇`;
  }

  function renderAnswer(q, data) {
    setFound(data.count || 0);
    const block = h('div', {}, [h('p', { style: 'margin:0 0 0.4rem;' }, answerLine(q, data))]);
    if (data.results && data.results.length) {
      const grid = h('div', { class: 'grid sm:grid-cols-2 gap-3 mt-2 stagger' });
      data.results.slice(0, 8).forEach(c => grid.appendChild(couponCard(c)));
      block.appendChild(grid);
    }
    block.appendChild(h('div', { class: 'chat-meta' },
      `via ${data.source}${data.cache_hit ? ' · cached' : ''}${data.intent && data.intent.confidence ? ' · intent ' + Math.round(data.intent.confidence * 100) + '%' : ''}` + (data.quota && !data.quota.unlimited ? ' · ' + data.quota.remaining + ' left this ' + (data.quota.window || 'day') : '') + ((data.results || []).some(r => r && r.is_affiliate) ? ' · some links are affiliate links' : '')));
    thread.appendChild(botRow(block, true));
    UI.Ads.afterResponse(thread);
    UI.Support.afterResponse(thread);
    UI.Banner.afterResponse(thread);
    scrollDown();
  }

  async function send(prefill) {
    const q = (typeof prefill === 'string' ? prefill : input.value).trim();
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
          h('p', { style: 'margin:0;' }, "You've used all your free guest searches for now."),
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

  // ---- Auto-run a query passed via ?q= ----
  const params = new URLSearchParams(location.search);
  const initialQ = (params.get('q') || '').trim();
  if (initialQ) { input.value = initialQ; send(initialQ); }
  else { input.focus(); }
})();
