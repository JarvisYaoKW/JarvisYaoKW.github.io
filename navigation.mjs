const states = new WeakMap();
export function syncNavigationIndicator(
  nav = document.querySelector('.header nav'),
  { animate = true } = {},
) {
  if (!nav) return;
  const active = nav.querySelector('[aria-current="page"]'),
    pill = nav.querySelector('.nav-indicator');
  if (!active || !pill) return;
  let state = states.get(nav);
  if (!state) {
    state = { frame: 0 };
    states.set(nav, state);
    if (globalThis.ResizeObserver) {
      state.observer = new ResizeObserver(() => syncNavigationIndicator(nav, { animate: false }));
      state.observer.observe(nav);
    }
  }
  const first = !nav.classList.contains('nav-sliding');
  if (first || !animate) {
    nav.classList.add('nav-instant');
    cancelAnimationFrame(state.frame);
  }
  const parent = nav.getBoundingClientRect(),
    rect = active.getBoundingClientRect();
  pill.style.transform = `translate3d(${rect.left - parent.left}px,${rect.top - parent.top}px,0)`;
  pill.style.width = rect.width + 'px';
  pill.style.height = rect.height + 'px';
  nav.classList.add('nav-sliding');
  if (first || !animate)
    state.frame = requestAnimationFrame(() => nav.classList.remove('nav-instant'));
}
if (typeof document !== 'undefined')
  document.fonts?.ready.then(() => syncNavigationIndicator(undefined, { animate: false }));
