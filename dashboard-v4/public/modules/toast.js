window.UI = {
  toast(message, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = message;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  },

  confirm(title, body, onConfirm) {
    const modal = document.getElementById('modal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = body;
    modal.classList.add('show');
    const btn = document.getElementById('modalConfirm');
    const handler = () => {
      modal.classList.remove('show');
      btn.removeEventListener('click', handler);
      onConfirm();
    };
    btn.addEventListener('click', handler, { once: true });
  },

  escape(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  },

  initials(name) {
    if (!name) return '?';
    return name.split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 2);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modalCancel')?.addEventListener('click', () => {
    document.getElementById('modal').classList.remove('show');
  });
  document.getElementById('modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal') document.getElementById('modal').classList.remove('show');
  });
});
