// ============================================================
// APP v4 — Orchestration multi-user
// ============================================================

async function bootstrap() {
  const isLoggedIn = await Auth.checkStatus();

  if (!isLoggedIn) {
    document.getElementById('loginView').style.display = '';
    document.getElementById('appView').style.display = 'none';
    return;
  }

  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').style.display = '';

  // Header user
  document.getElementById('userName').textContent = State.user.displayName || State.user.username;
  const avatar = document.getElementById('userAvatar');
  avatar.style.background = State.user.color || '#4a9eff';
  avatar.textContent = UI.initials(State.user.displayName || State.user.username);

  // Charge tout
  await Team.refresh();
  await Agents.refresh();
  await Timeline.refresh();
  await Timeline.refreshQueue();
  Account.load();

  // WebSocket
  WS.connect();

  // Tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('tab-' + t.dataset.tab).classList.add('active');
      if (t.dataset.tab === 'team') Team.refresh();
      if (t.dataset.tab === 'agents') Agents.refresh();
    });
  });

  // Refresh périodique
  setInterval(() => Timeline.refresh(), 10000);
  setInterval(() => Agents.refresh(), 15000);
}

bootstrap();
