window.Auth = {
  isRegister: false,

  async checkStatus() {
    try {
      const status = await API.get('/api/status');
      this.isRegister = !status.hasUsers; // si pas de users, on force l'inscription
      this.updateUI();
      const me = await API.get('/api/me');
      if (me.user) {
        State.user = me.user;
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  updateUI() {
    const subtitle = document.getElementById('authSubtitle');
    const btn = document.getElementById('loginBtn');
    const toggle = document.getElementById('authToggle');
    const dnRow = document.getElementById('displayNameRow');

    if (this.isRegister) {
      subtitle.textContent = State.firstUser ? 'Créer le compte admin' : 'Créer un compte';
      btn.textContent = 'Créer';
      dnRow.style.display = '';
      toggle.innerHTML = !State.firstUser ? '<a id="goLogin">← Se connecter</a>' : '';
    } else {
      subtitle.textContent = 'Connexion';
      btn.textContent = 'Se connecter';
      dnRow.style.display = 'none';
      toggle.innerHTML = ''; // pas d'auto-register
    }

    document.getElementById('goLogin')?.addEventListener('click', () => {
      this.isRegister = false;
      this.updateUI();
    });
  },

  init() {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const displayName = document.getElementById('loginDisplayName').value.trim() || username;
      const errorEl = document.getElementById('loginError');
      errorEl.textContent = '';
      try {
        if (this.isRegister) {
          await API.post('/api/register', { username, password, displayName });
        } else {
          await API.post('/api/login', { username, password });
        }
        location.reload();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await API.post('/api/logout');
      location.reload();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Auth.init());
