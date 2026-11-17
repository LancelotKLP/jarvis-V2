window.Timeline = {
  async refresh() {
    try {
      State.entries = await API.get('/api/history');
      this.render();
    } catch (e) { console.error(e); }
  },

  async refreshQueue() {
    if (!State.targetAgentId) return this.updateQueue([]);
    try {
      const r = await API.get('/api/queue?agentId=' + State.targetAgentId);
      this.updateQueue(r.queue || []);
    } catch (e) {}
  },

  updateQueue(queue) {
    State.queue = queue;
    const zone = document.getElementById('queueZone');
    const list = document.getElementById('queueList');
    const name = document.getElementById('queueAgentName');

    if (!queue || queue.length === 0) {
      zone.style.display = 'none';
      return;
    }
    const agent = State.agents.find(a => a.id === State.targetAgentId);
    zone.style.display = 'block';
    if (name) name.textContent = agent?.name || '?';
    if (list) {
      list.innerHTML = queue.map(q => `<div class="queue-item">${UI.escape(q.message.substring(0, 100))}${q.message.length > 100 ? '...' : ''}</div>`).join('');
    }
  },

  render() {
    const tl = document.getElementById('timeline');
    if (!tl) return;
    const entries = [...State.entries].reverse();
    if (entries.length === 0) {
      tl.innerHTML = '<div class="empty">📭 Aucune entrée. Envoie ta première instruction !</div>';
      return;
    }
    const usersById = Object.fromEntries(State.users.map(u => [u.id, u]));

    tl.innerHTML = entries.slice(0, 200).map(e => {
      const icon = e.status === 'success' ? '✅' : e.status === 'error' ? '🚨' : '💬';
      const date = new Date(e.timestamp);
      const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      const author = e.authorId ? usersById[e.authorId] : null;
      const authorBadge = author ? `<span class="entry-author" style="background:${author.color || '#7a8599'}">${UI.escape(author.displayName || author.username)}</span>` : '';
      const dirBadge = e.direction === 'sent' ? '<span class="entry-direction">→ envoyé</span>' : '';

      return `
        <div class="entry ${e.status} ${e.direction}">
          <div class="entry-icon">${icon}</div>
          <div class="entry-content">
            <div class="entry-message">${UI.escape(e.message)}</div>
            <div class="entry-meta">
              <span>${dateStr} • ${time}</span>
              ${authorBadge}
              ${dirBadge}
              ${e.project ? `<span class="entry-direction">📁 ${UI.escape(e.project)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async send(message) {
    if (!message?.trim()) return;
    if (!State.targetAgentId) return UI.toast('❌ Aucun agent ciblé', true);
    const sendBtn = document.getElementById('sendBtn');
    const sendStatus = document.getElementById('sendStatus');
    sendBtn.disabled = true;
    sendStatus.textContent = '⏳ Envoi...';
    sendStatus.classList.remove('error');
    try {
      await API.post('/api/send', { message, targetAgentId: State.targetAgentId });
      sendStatus.textContent = '✅ Envoyé !';
      document.getElementById('instruction').value = '';
      setTimeout(() => sendStatus.textContent = '', 3000);
    } catch (e) {
      sendStatus.textContent = '❌ ' + e.message;
      sendStatus.classList.add('error');
    } finally {
      sendBtn.disabled = false;
    }
  },

  init() {
    document.getElementById('sendBtn').addEventListener('click', () => {
      this.send(document.getElementById('instruction').value);
    });
    document.getElementById('instruction').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        this.send(document.getElementById('instruction').value);
      }
    });
    document.getElementById('queueClearBtn')?.addEventListener('click', async () => {
      try {
        await API.post('/api/queue/clear', { agentId: State.targetAgentId });
        this.updateQueue([]);
        UI.toast('✅ File vidée');
      } catch (e) { UI.toast('❌ ' + e.message, true); }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Timeline.init());
