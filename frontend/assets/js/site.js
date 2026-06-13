/* =====================================================================
   CouponFind — shared marketing site chrome (header + footer)
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
            <span class="font-extrabold tracking-tight" style="font-size:1.1rem;">CouponFind</span>
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
      <footer class="border-t hairline mt-16">
        <div class="max-w-6xl mx-auto px-5 py-12 grid md:grid-cols-4 gap-8">
          <div>
            <a href="/" class="flex items-center gap-2" style="text-decoration:none;color:var(--text);">
              <span class="brand-mark" style="width:28px;height:28px;">C</span><span class="font-extrabold">CouponFind</span>
            </a>
            <p class="text-muted text-sm mt-3" style="max-width:240px;">The AI coupon search that works like a conversation.</p>
          </div>
          <div>
            <div class="font-bold text-sm mb-3">Product</div>
            <div class="grid gap-2 text-sm">
              <a href="/#features" style="color:var(--muted);text-decoration:none;">Features</a>
              <a href="/pricing" style="color:var(--muted);text-decoration:none;">Pricing</a>
              <a href="/#how" style="color:var(--muted);text-decoration:none;">How it works</a>
            </div>
          </div>
          <div>
            <div class="font-bold text-sm mb-3">Company</div>
            <div class="grid gap-2 text-sm">
              <a href="/about" style="color:var(--muted);text-decoration:none;">About us</a>
              <a href="/contact" style="color:var(--muted);text-decoration:none;">Contact</a>
              <a href="/login" style="color:var(--muted);text-decoration:none;">Sign in</a>
            </div>
          </div>
          <div>
            <div class="font-bold text-sm mb-3">Legal</div>
            <div class="grid gap-2 text-sm">
              <a href="/privacy" style="color:var(--muted);text-decoration:none;">Privacy Policy</a>
              <a href="/terms" style="color:var(--muted);text-decoration:none;">Terms &amp; Conditions</a>
            </div>
          </div>
        </div>
        <div class="border-t hairline">
          <div class="max-w-6xl mx-auto px-5 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-muted text-sm">
            <span>© ${year} CouponFind. Built for speed.</span>
            <span>Made for people who hate paying full price.</span>
          </div>
        </div>
      </footer>`;
  }
})();
