// Fixed marketing examples only: no requests, storage, or clinical evaluation.
document.querySelectorAll('[data-demo-switch]').forEach(demo => {
  demo.addEventListener('click', event => {
    const button = event.target.closest('button[data-demo-target]');
    if (!button || !demo.contains(button)) return;
    const target = button.dataset.demoTarget;
    const panels = [...demo.querySelectorAll('[data-demo-panel]')];
    if (!panels.some(panel => panel.id === target)) return;
    panels.forEach(panel => { panel.hidden = panel.id !== target; });
    demo.querySelectorAll('button[aria-pressed][data-demo-target]').forEach(tab => {
      tab.setAttribute('aria-pressed', String(tab.dataset.demoTarget === target));
    });
    // A forward button may hide itself; keep keyboard focus on the selected tab.
    if (button.closest('[hidden]')) {
      demo.querySelector('button[aria-pressed="true"]')?.focus({ preventScroll: true });
    }
  });
});
