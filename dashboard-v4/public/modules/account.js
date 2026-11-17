window.Account = {
  init() {
    document.getElementById('accSaveBtn')?.addEventListener('click', async () => {
      try {
        const displayName = document.getElementById('accDisplayName').value;
        const color = document.getElementById('accColor').value;
        await API.post('/api/users/update', { displayName, color });
        State.user.displayName = displayName;
        State.user.color = color;
        document.getElementById('userName').textContent = displayName;
        UI.toast('✅ Profil mis à jour');
        Team.refresh();
      } catch (e) { UI.toast('❌ ' + e.message, true); }
    });

    document.getElementById('accPasswordBtn')?.addEventListener('click', async () => {
      const newPassword = document.getElementById('accNewPassword').value;
      if (!newPassword || newPassword.length < 4) return UI.toast('❌ Password trop court (min 4)', true);
      try {
        await API.post('/api/users/password', { newPassword });
        document.getElementById('accNewPassword').value = '';
        UI.toast('✅ Password changé');
      } catch (e) { UI.toast('❌ ' + e.message, true); }
    });
  },

  load() {
    document.getElementById('accDisplayName').value = State.user.displayName || '';
    document.getElementById('accColor').value = State.user.color || '#4a9eff';
  },
};

document.addEventListener('DOMContentLoaded', () => Account.init());
