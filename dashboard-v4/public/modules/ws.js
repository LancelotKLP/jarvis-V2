window.WS = {
  ws: null,
  reconnectTimeout: null,

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        document.getElementById('liveStatus').textContent = 'En direct';
      };
      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          this.handleMessage(data);
        } catch (e) {}
      };
      this.ws.onclose = () => {
        document.getElementById('liveStatus').textContent = 'Reconnexion...';
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
      };
      this.ws.onerror = () => { try { this.ws.close(); } catch (e) {} };
    } catch (e) {
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    }
  },

  handleMessage(data) {
    if (data.event === 'newEntry') {
      Timeline.refresh();
    } else if (data.event === 'queueUpdate') {
      // Update si c'est sur l'agent qu'on regarde
      if (data.agentId === State.targetAgentId) {
        Timeline.updateQueue(data.queue || []);
      }
    } else if (data.event === 'agentStatusChange') {
      Agents.refresh();
    }
  },
};
