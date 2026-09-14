document.addEventListener('DOMContentLoaded', () => {
  const menu = document.querySelector('.menu-btn');
  const links = document.querySelector('.nav-links');
  const closeMenu = () => { links?.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); };
  menu?.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  links?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  const dialog = document.querySelector('#image-viewer');
  if (!dialog) return;
  const photo = dialog.querySelector('img');
  const caption = dialog.querySelector('p');
  let trigger;
  document.querySelectorAll('[data-zoom]').forEach(button => {
    button.addEventListener('click', () => {
      trigger = button;
      const img = button.querySelector('img');
      photo.src = img.src; photo.alt = img.alt; caption.textContent = img.alt;
      dialog.showModal(); document.body.style.overflow = 'hidden';
    });
  });
  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; trigger?.focus(); });
});
