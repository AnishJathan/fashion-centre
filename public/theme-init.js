// Runs before the body is parsed. Never repairs or writes browser storage here.
(() => {
  let preference = 'system';
  try {
    const saved = JSON.parse(localStorage.getItem('fc.theme.v1'));
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
  } catch { /* Unreadable records stay intact; React handles recovery on an explicit save. */ }
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
