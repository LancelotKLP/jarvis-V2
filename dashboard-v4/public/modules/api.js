window.API = {
  async get(url) {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'HTTP ' + r.status);
    }
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'HTTP ' + r.status);
    }
    return r.json();
  },
};
