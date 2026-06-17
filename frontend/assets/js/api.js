/* =====================================================================
   Couponaut API client (vanilla JS)
   - JSON fetch wrapper with bearer token + CSRF handling
   - transparent access-token refresh on 401
   ===================================================================== */
(function (global) {
  const TOKEN_KEY = 'cf_access';
  const REFRESH_KEY = 'cf_refresh';
  const CSRF_KEY = 'cf_csrf';
  const USER_KEY = 'cf_user';

  const store = {
    get access() { return localStorage.getItem(TOKEN_KEY); },
    set access(v) { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); },
    get refresh() { return localStorage.getItem(REFRESH_KEY); },
    set refresh(v) { v ? localStorage.setItem(REFRESH_KEY, v) : localStorage.removeItem(REFRESH_KEY); },
    get csrf() { return localStorage.getItem(CSRF_KEY); },
    set csrf(v) { v ? localStorage.setItem(CSRF_KEY, v) : localStorage.removeItem(CSRF_KEY); },
    get user() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } },
    set user(v) { v ? localStorage.setItem(USER_KEY, JSON.stringify(v)) : localStorage.removeItem(USER_KEY); },
    clear() { [TOKEN_KEY, REFRESH_KEY, CSRF_KEY, USER_KEY].forEach(k => localStorage.removeItem(k)); }
  };

  async function raw(method, path, body, opts = {}) {
    const headers = { 'Accept': 'application/json' };
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (store.access && !opts.noAuth) headers['Authorization'] = 'Bearer ' + store.access;
    if (store.csrf) headers['X-CSRF-Token'] = store.csrf;

    const res = await fetch('/api' + path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });

    let json = null;
    const text = await res.text();
    if (text) { try { json = JSON.parse(text); } catch (e) { json = { success: false, message: text }; } }
    return { res, json };
  }

  async function request(method, path, body, opts = {}) {
    let { res, json } = await raw(method, path, body, opts);

    // Auto-refresh once on 401.
    if (res.status === 401 && store.refresh && !opts._retried) {
      const ok = await tryRefresh();
      if (ok) return request(method, path, body, { ...opts, _retried: true });
    }

    if (!res.ok) {
      const err = new Error((json && json.message) || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      err.errors = (json && json.errors) || null;
      err.payload = json;
      throw err;
    }
    return json ? json.data ?? json : null;
  }

  async function tryRefresh() {
    try {
      const { res, json } = await raw('POST', '/auth/refresh', { refresh_token: store.refresh }, { noAuth: true });
      if (res.ok && json && json.data) {
        applyAuth(json.data);
        return true;
      }
    } catch (e) { /* ignore */ }
    store.clear();
    return false;
  }

  function applyAuth(data) {
    if (data.access_token) store.access = data.access_token;
    if (data.refresh_token) store.refresh = data.refresh_token;
    if (data.csrf_token) store.csrf = data.csrf_token;
    if (data.user) store.user = data.user;
  }

  const API = {
    store,
    applyAuth,
    isAuthed: () => !!store.access,
    get: (p, o) => request('GET', p, undefined, o),
    post: (p, b, o) => request('POST', p, b, o),
    put: (p, b, o) => request('PUT', p, b, o),
    patch: (p, b, o) => request('PATCH', p, b, o),
    del: (p, o) => request('DELETE', p, undefined, o),

    async login(email, password) {
      const { res, json } = await raw('POST', '/auth/login', { email, password }, { noAuth: true });
      if (!res.ok) throw Object.assign(new Error(json?.message || 'Login failed'), { errors: json?.errors });
      applyAuth(json.data);
      return json.data;
    },
    async register(payload) {
      const { res, json } = await raw('POST', '/auth/register', payload, { noAuth: true });
      if (!res.ok) throw Object.assign(new Error(json?.message || 'Registration failed'), { errors: json?.errors });
      applyAuth(json.data);
      return json.data;
    },
    async logout() {
      try { await request('POST', '/auth/logout', { refresh_token: store.refresh }); } catch (e) {}
      store.clear();
    },
    async me() { return request('GET', '/auth/me'); },
  };

  global.API = API;

  // ---- PWA setup (runs on every page that loads api.js) ----
  (function setupPWA() {
    try {
      const head = document.head;
      const ensure = (sel, make) => { if (!document.querySelector(sel)) head.appendChild(make()); };
      const meta = (name, content) => { const m = document.createElement('meta'); m.name = name; m.content = content; return m; };
      ensure('link[rel="manifest"]', () => { const l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.json'; return l; });
      ensure('meta[name="theme-color"]', () => meta('theme-color', '#0a0a0a'));
      ensure('meta[name="mobile-web-app-capable"]', () => meta('mobile-web-app-capable', 'yes'));
      ensure('meta[name="apple-mobile-web-app-capable"]', () => meta('apple-mobile-web-app-capable', 'yes'));
      ensure('meta[name="apple-mobile-web-app-status-bar-style"]', () => meta('apple-mobile-web-app-status-bar-style', 'black-translucent'));
      ensure('meta[name="apple-mobile-web-app-title"]', () => meta('apple-mobile-web-app-title', 'Couponaut'));
      ensure('link[rel="apple-touch-icon"]', () => { const l = document.createElement('link'); l.rel = 'apple-touch-icon'; l.href = '/icon.svg'; return l; });
      ensure('link[rel="icon"]', () => { const l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = '/icon.svg'; return l; });
    } catch (e) { /* non-fatal */ }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => { /* SW optional */ });
      });
    }

    // Floating "Ask Couponaut AI" button on marketing/content pages
    // (hidden on the app, admin, auth and the /ai page itself).
    try {
      const p = location.pathname;
      const hidden = /^\/(app|admin|ai|login|register|forgot-password|reset-password)(\/|$)/.test(p);
      if (!hidden) {
        const add = () => {
          if (document.querySelector('.ai-fab')) return;
          const a = document.createElement('a');
          a.href = '/ai';
          a.className = 'ai-fab';
          a.setAttribute('aria-label', 'Ask Couponaut AI');
          a.innerHTML = '<span class="fab-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg></span>'
            + '<span class="fab-text"><span class="fab-title">Ask Couponaut AI</span><span class="fab-sub">Find deals · coupons · cashback</span></span>';
          document.body.appendChild(a);
        };
        if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
      }
    } catch (e) { /* non-fatal */ }
  })();
})(window);



/* =====================================================================
   Instagram-style mobile bottom tab bar on marketing/content pages.
   (The /app dashboard ships its own tab bar; /ai uses its composer.)
   ===================================================================== */
(function () {
  try {
    var p = location.pathname;
    if (/^\/(app|admin|ai|login|register|forgot-password|reset-password)(\/|$)/.test(p)) return;
    var add = function () {
      if (!document.body || document.querySelector('.mobile-tabbar')) return;
      var authed = !!(window.API && API.isAuthed && API.isAuthed());
      var acctHref = authed ? '/app' : '/login';
      var acctLabel = authed ? 'Account' : 'Sign in';
      var ico = {
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
        ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>',
        tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
        user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      };
      var nav = document.createElement('nav');
      nav.className = 'mobile-tabbar';
      nav.setAttribute('aria-label', 'Primary');
      nav.innerHTML =
        '<a href="/" class="tab" data-p="/">' + ico.home + '<span>Home</span></a>' +
        '<a href="/ai" class="tab" data-p="/ai">' + ico.ai + '<span>AI Search</span></a>' +
        '<a href="/pricing" class="tab" data-p="/pricing">' + ico.tag + '<span>Pricing</span></a>' +
        '<a href="' + acctHref + '" class="tab" data-p="acct">' + ico.user + '<span>' + acctLabel + '</span></a>';
      document.body.appendChild(nav);
      document.body.classList.add('has-tabbar');
      var cur = (location.pathname.replace(/\/+$/, '') || '/');
      Array.prototype.forEach.call(nav.querySelectorAll('.tab'), function (t) {
        if (t.getAttribute('data-p') === cur) t.classList.add('active');
      });
    };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  } catch (e) { /* non-fatal */ }
})();
