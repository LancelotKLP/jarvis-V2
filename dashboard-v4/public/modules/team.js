window.Team = {
  async refresh() {
    try {
      State.users = await API.get('/api/users');
      this.render();
    } catch (e) { console.error(e); }
  },

  render() {
    const c = document.getElementById('teamList');
    if (!c) return;
    if (State.users.length === 0) {
      c.innerHTML = '<div class="empty">Aucun utilisateur</div>';
      return;
    }
    c.innerHTML = State.users.map(u => {
      const myAgents = State.agents.filter(a => a.userId === u.id);
      const onlineCount = myAgents.filter(a => a.online).length;
      return `
        <div class="team-member">
          <div class="team-avatar" style="background:${u.color || '#4a9eff'}">${UI.initials(u.displayName || u.username)}</div>
          <div class="team-info">
            <div class="team-name">${UI.escape(u.displayName || u.username)}</div>
            <div class="team-username">@${UI.escape(u.username)} ${u.id === State.user.id ? '(toi)' : ''}</div>
            <div class="team-agents-list">
              ${myAgents.length === 0 ? '<div class="team-agent-item">Aucun agent</div>' :
                myAgents.map(a => `
                  <div class="team-agent-item">
                    <span class="dot ${a.online ? 'online' : 'offline'}"></span>
                    <span>${UI.escape(a.name)}</span>
                    ${a.online ? '<span style="color:var(--success);font-size:10px">● ONLINE</span>' : ''}
                    ${u.id !== State.user.id && a.online ? `<button class="action-btn" style="margin-left:auto" onclick="Team.targetAgent('${a.id}')">🎯 Piloter</button>` : ''}
                  </div>
                `).join('')
              }
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  targetAgent(id) {
    State.targetAgentId = id;
    document.getElementById('targetSelect').value = id;
    Timeline.refreshQueue();
    UI.toast('🎯 Cible définie sur cet agent');
    // Switch to timeline tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="timeline"]').classList.add('active');
    document.getElementById('tab-timeline').classList.add('active');
  },
};
