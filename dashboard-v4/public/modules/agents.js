window.Agents = {
  async refresh() {
    try {
      State.agents = await API.get('/api/agents');
      State.myAgents = State.agents.filter(a => a.userId === State.user.id);
      this.renderTargetSelect();
      this.renderMyAgents();
    } catch (e) { console.error(e); }
  },

  renderTargetSelect() {
    const sel = document.getElementById('targetSelect');
    if (!sel) return;
    const onlineFirst = [...State.agents].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    if (onlineFirst.length === 0) {
      sel.innerHTML = '<option value="">Aucun agent — crée-en un</option>';
      State.targetAgentId = null;
      return;
    }
    const usersById = Object.fromEntries(State.users.map(u => [u.id, u]));
    sel.innerHTML = onlineFirst.map(a => {
      const owner = usersById[a.userId];
      const ownerLabel = owner?.id === State.user.id ? '(moi)' : owner?.displayName || '';
      const status = a.online ? '🟢' : '⚫';
      return `<option value="${UI.escape(a.id)}">${status} ${UI.escape(a.name)} ${ownerLabel}</option>`;
    }).join('');

    // Restaure ou prend le premier
    if (State.targetAgentId && State.agents.find(a => a.id === State.targetAgentId)) {
      sel.value = State.targetAgentId;
    } else {
      State.targetAgentId = onlineFirst[0].id;
      sel.value = State.targetAgentId;
    }
  },

  renderMyAgents() {
    const c = document.getElementById('myAgentsList');
    if (!c) return;
    if (State.myAgents.length === 0) {
      c.innerHTML = '<div class="empty">Aucun agent. Clique sur "➕ Nouvel agent" en haut pour en créer un.</div>';
      return;
    }
    c.innerHTML = State.myAgents.map(a => `
      <div class="agent-card">
        <div class="agent-info">
          <div class="agent-name">${UI.escape(a.name)}</div>
          <div class="agent-meta">
            <span class="${a.online ? 'status-online' : 'status-offline'}">
              <span class="dot ${a.online ? 'online' : 'offline'}"></span>
              ${a.online ? 'En ligne' : 'Hors ligne'}
            </span>
            <span>📍 ${a.chatboxX},${a.chatboxY} → ${a.sendX},${a.sendY}</span>
          </div>
        </div>
        <div class="agent-actions">
          <button class="action-btn" onclick="Agents.showSetup('${a.id}')">🔑 Setup</button>
          <button class="action-btn" onclick="Agents.editChatbox('${a.id}')">🎯 Chatbox</button>
          <button class="action-btn danger" onclick="Agents.remove('${a.id}')">🗑</button>
        </div>
      </div>
    `).join('');
  },

  showSetup(id) {
    const agent = State.agents.find(a => a.id === id);
    if (!agent) return;
    const serverUrl = location.protocol + '//' + location.host;
    document.getElementById('tokenAgentName').textContent = agent.name;
    const cmd = `# Sur le PC "${agent.name}", lance ces commandes :

mkdir -p ~/claude-agent
cat > ~/.claude-dashboard-agent.json << 'EOF'
{
  "serverUrl": "${serverUrl}",
  "agentToken": "${agent.apiToken}"
}
EOF

# Récupère le script agent.js depuis le dashboard et lance-le :
curl -s ${serverUrl}/agent.js -o ~/claude-agent/agent.js
node ~/claude-agent/agent.js`;

    document.getElementById('tokenSetupCmd').textContent = cmd;
    document.getElementById('tokenModal').classList.add('show');
  },

  async editChatbox(id) {
    const agent = State.agents.find(a => a.id === id);
    if (!agent) return;
    const x = prompt(`X champ texte (actuel: ${agent.chatboxX}) :`, agent.chatboxX);
    if (x === null) return;
    const y = prompt(`Y champ texte (actuel: ${agent.chatboxY}) :`, agent.chatboxY);
    if (y === null) return;
    const sx = prompt(`X bouton envoyer (actuel: ${agent.sendX}) :`, agent.sendX);
    if (sx === null) return;
    const sy = prompt(`Y bouton envoyer (actuel: ${agent.sendY}) :`, agent.sendY);
    if (sy === null) return;
    try {
      await API.post('/api/agents/update', {
        id, chatboxX: parseInt(x, 10), chatboxY: parseInt(y, 10),
        sendX: parseInt(sx, 10), sendY: parseInt(sy, 10),
      });
      UI.toast('✅ Coordonnées sauvegardées (relance l\'agent pour appliquer)');
      this.refresh();
    } catch (e) { UI.toast('❌ ' + e.message, true); }
  },

  async remove(id) {
    UI.confirm('Supprimer cet agent ?', 'Le PC ne pourra plus se connecter avec ce token.', async () => {
      try {
        await API.post('/api/agents/delete', { id });
        UI.toast('✅ Supprimé');
        this.refresh();
      } catch (e) { UI.toast('❌ ' + e.message, true); }
    });
  },

  init() {
    document.getElementById('targetSelect')?.addEventListener('change', (e) => {
      State.targetAgentId = e.target.value;
      Timeline.refreshQueue();
    });

    document.getElementById('newAgentBtn')?.addEventListener('click', () => {
      document.getElementById('newAgentName').value = '';
      document.getElementById('newAgentModal').classList.add('show');
    });
    document.getElementById('newAgentCancel')?.addEventListener('click', () => {
      document.getElementById('newAgentModal').classList.remove('show');
    });
    document.getElementById('newAgentCreate')?.addEventListener('click', async () => {
      const name = document.getElementById('newAgentName').value.trim();
      if (!name) return UI.toast('❌ Nom requis', true);
      try {
        const agent = await API.post('/api/agents', { name });
        document.getElementById('newAgentModal').classList.remove('show');
        UI.toast('✅ Agent créé');
        await this.refresh();
        this.showSetup(agent.id);
      } catch (e) { UI.toast('❌ ' + e.message, true); }
    });

    // Token modal
    document.getElementById('tokenClose')?.addEventListener('click', () => {
      document.getElementById('tokenModal').classList.remove('show');
    });
    document.getElementById('tokenCopy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById('tokenSetupCmd').textContent);
        UI.toast('✅ Copié');
      } catch (e) { UI.toast('❌ Impossible de copier', true); }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Agents.init());
