/* Compatibility bridge: the repository keeps runtime scripts at the root while index.html uses /js paths. */
(() => {
  const load = (src) => new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
  load('../app.js').then(() => load('../app-fixes.js'));
})();
