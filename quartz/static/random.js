(function() {
  function injectButton() {
    if (document.querySelector('.random-article-btn')) return;

    // Try several selectors, from most specific to most general
    const anchor =
      document.querySelector('.search') ||
      document.querySelector('input[type="text"]')?.closest('div') ||
      document.querySelector('.sidebar.left');

    if (!anchor) return;

    const btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'random-article-btn';
    btn.textContent = 'Random Article';
    btn.style.cssText = 'display:block;margin:0.5rem 0;padding:0.55rem 0.75rem;text-align:center;border:1px solid var(--gray);border-radius:4px;color:var(--dark);text-decoration:none;cursor:pointer;font-size:0.85rem;background:transparent;transition:all 0.2s;';
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--lightgray)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });

    anchor.parentNode.insertBefore(btn, anchor.nextSibling);

    let index = null;
    let baseUrl = '';

    btn.addEventListener('click', async function(e) {
      e.preventDefault();
      if (!index) {
        const candidates = [
          window.location.pathname.split('/').slice(0, 2).join('/') + '/random-index.json',
          '/random-index.json',
          'random-index.json'
        ];
        for (const url of candidates) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              index = await res.json();
              baseUrl = url.replace('random-index.json', '');
              break;
            }
          } catch (err) { /* try next */ }
        }
        if (!index) {
          console.error('Random Article: could not load index');
          btn.textContent = 'Unavailable';
          return;
        }
      }

      let history = JSON.parse(sessionStorage.getItem('randomHistory') || '[]');
      let pool = index.filter(u => !history.includes(u));
      if (pool.length === 0) { history = []; pool = index; }

      const pick = pool[Math.floor(Math.random() * pool.length)];
      history.push(pick);
      if (history.length > 10) history.shift();
      sessionStorage.setItem('randomHistory', JSON.stringify(history));

      window.location.href = baseUrl + pick;
    });
  }

  // Run on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }

  // Re-run on SPA navigation
  document.addEventListener('nav', injectButton);
  document.addEventListener('render', injectButton);

  // Safety net: poll for a few seconds
  let tries = 0;
  const poll = setInterval(() => {
    injectButton();
    if (++tries > 20 || document.querySelector('.random-article-btn')) clearInterval(poll);
  }, 250);
})();
