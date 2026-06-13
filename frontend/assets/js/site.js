/* =====================================================================
   Couponaut — shared marketing site chrome (header + footer)
   Injected into static pages (about, contact, privacy, terms, pricing).
   ===================================================================== */
(function () {
  const year = new Date().getFullYear();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const links = [
    { href: '/#features', label: 'Features' },
    { href: '/#how', label: 'How it works' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ];
  const isActive = (href) => href === path;
  const navLinks = (cls) => links.map(l =>
    `<a href="${l.href}" class="${cls}" style="color:${isActive(l.href) ? 'var(--text)' : 'var(--muted)'};text-decoration:none;${isActive(l.href) ? 'font-weight:600;' : ''}">${l.label}</a>`
  ).join('');

  const header = document.getElementById('site-header');
  if (header) {
    header.innerHTML = `
      <header class="glass" style="position:sticky;top:0;z-index:50;border-left:none;border-right:none;border-top:none;">
        <div class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" class="flex items-center gap-2" style="text-decoration:none;color:var(--text);">
            <span class="brand-mark" style="width:30px;height:30px;">C</span>
            <span class="font-extrabold tracking-tight" style="font-size:1.1rem;">Couponaut</span>
          </a>
          <nav class="hidden md:flex items-center gap-7 text-sm">${navLinks('')}</nav>
          <div class="hidden md:flex items-center gap-2">
            <a href="/login" class="btn btn-ghost btn-sm">Sign in</a>
            <a href="/register" class="btn btn-primary btn-sm">Get started</a>
          </div>
          <button id="nav-toggle" class="btn btn-ghost md:hidden" aria-label="Open menu" style="width:40px;height:40px;padding:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
        </div>
        <div id="mobile-menu" class="md:hidden hide" style="border-top:1px solid var(--border);background:var(--card);">
          <div class="px-5 py-3 grid gap-1">
            ${navLinks('nav-item')}
            <div class="grid grid-cols-2 gap-2 mt-2">
              <a href="/login" class="btn btn-ghost">Sign in</a>
              <a href="/register" class="btn btn-primary">Get started</a>
            </div>
          </div>
        </div>
      </header>`;
    const t = document.getElementById('nav-toggle');
    const m = document.getElementById('mobile-menu');
    if (t) t.addEventListener('click', () => m.classList.toggle('hide'));
    if (m) m.addEventListener('click', (e) => { if (e.target.closest('a')) m.classList.add('hide'); });
  }

  const footer = document.getElementById('site-footer');
  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div class="max-w-6xl mx-auto px-5 py-14 grid gap-10 md:grid-cols-5">
          <div class="md:col-span-2">
            <a href="/" class="flex items-center gap-2" style="text-decoration:none;color:var(--text);">
              <span class="brand-mark" style="width:30px;height:30px;">C</span><span class="font-extrabold" style="font-size:1.1rem;">Couponaut</span>
            </a>
            <p class="text-muted text-sm mt-3" style="max-width:300px;line-height:1.6;">The AI coupon search that finds the best working code — just ask, like a conversation.</p>
            <div class="flex items-center gap-2 mt-5">
              <a class="footer-social" aria-label="X (Twitter)" href="#"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.36-7.01L4.66 22H1.4l8.02-9.17L1 2h7.02l4.84 6.42L18.244 2Zm-1.2 18h1.9L7.04 4H5.02l12.024 16Z"/></svg></a>
              <a class="footer-social" aria-label="GitHub" href="#"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg></a>
              <a class="footer-social" aria-label="LinkedIn" href="#"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0ZM.5 8h4V24h-4V8Zm7.5 0h3.8v2.2h.05c.53-1 1.83-2.2 3.77-2.2 4.03 0 4.78 2.65 4.78 6.1V24h-4v-7.1c0-1.7-.03-3.88-2.36-3.88-2.36 0-2.72 1.84-2.72 3.75V24h-4V8Z"/></svg></a>
            </div>
          </div>
          <div>
            <div class="footer-col-title">Product</div>
            <div class="grid gap-2.5"><a class="footer-link" href="/#features">Features</a><a class="footer-link" href="/pricing">Pricing</a><a class="footer-link" href="/#how">How it works</a></div>
          </div>
          <div>
            <div class="footer-col-title">Company</div>
            <div class="grid gap-2.5"><a class="footer-link" href="/about">About us</a><a class="footer-link" href="/contact">Contact</a></div>
          </div>
          <div>
            <div class="footer-col-title">Get started</div>
            <div class="grid gap-2.5"><a class="footer-link" href="/login">Sign in</a><a class="footer-link" href="/register">Create account</a><a class="footer-link" href="/privacy">Privacy</a><a class="footer-link" href="/terms">Terms</a></div>
          </div>
        </div>
        <div class="footer-bottom">
          <div class="max-w-6xl mx-auto px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-muted" style="font-size:0.85rem;">
            <span>© ${year} Couponaut. All rights reserved.</span>
            <span class="flex items-center gap-4"><a class="footer-link" href="/privacy">Privacy</a><a class="footer-link" href="/terms">Terms</a><a class="footer-link" href="/contact">Contact</a></span>
          </div>
        </div>
      </footer>`;
  }
})();
