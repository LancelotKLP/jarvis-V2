# 🚀 Claude Dashboard v4 — Multi-user

Dashboard multi-user pour piloter Claude Code à distance depuis le téléphone ou n'importe quel navigateur.

## 📋 Architecture

```
                    🍓 Serveur central (Pi ou Mac)
                    ┌────────────────────────────┐
                    │  • Dashboard web (port 3000) │
                    │  • API REST + WebSocket      │
                    │  • SQLite database           │
                    └─────────────┬──────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
   👤 User A                  👤 User B                 👤 User C
   📱 Web + 💻 PC + agent     📱 Web + 💻 PC + agent   📱 Web + 💻 PC + agent
```

## 🍓 Installation sur le serveur (Pi ou Mac)

### 1. Pré-requis

- Node.js 18+ installé
- Sur Mac : déjà OK
- Sur Raspberry Pi : `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`

### 2. Décompresser et installer

```bash
unzip claude-dashboard-v4.zip -d ~
cd ~/dashboard-v4
npm install
```

### 3. Lancer le serveur

```bash
node index.js
```

Ou en daemon avec PM2 :
```bash
npm install -g pm2
pm2 start index.js --name claude-dashboard
pm2 save
pm2 startup
```

### 4. Accéder

Ouvre `http://IP_DU_SERVEUR:3000` (ex: `http://100.83.79.99:3000` si Tailscale).

Le **premier compte créé est admin** automatiquement.

## 💻 Installation de l'agent (sur chaque PC)

L'agent est un petit script Node.js qui tourne sur le PC du user et exécute les ordres reçus du serveur.

### 1. Créer un agent dans le dashboard
- Connecte-toi au dashboard
- Onglet "🖥 Agents" → "➕ Nouvel agent (mon PC)"
- Donne un nom (ex: "Mac Pro Mael")

### 2. Setup sur le PC

Le dashboard te montre la commande exacte à lancer. Elle ressemble à :

```bash
mkdir -p ~/claude-agent
cat > ~/.claude-dashboard-agent.json << 'EOF'
{
  "serverUrl": "http://100.83.79.99:3000",
  "agentToken": "TON_TOKEN_ICI"
}
EOF

curl -s http://100.83.79.99:3000/agent.js -o ~/claude-agent/agent.js
node ~/claude-agent/agent.js
```

### 3. Configurer la chatbox

Dans le dashboard, onglet "🖥 Agents" → "🎯 Chatbox" sur ton agent. Utilise `cliclick p` pour trouver les coordonnées.

### 4. Lancer en permanence

```bash
nohup node ~/claude-agent/agent.js > ~/claude-agent.log 2>&1 &
```

Ou via launchd / pm2 selon ta préf.

## 🎯 Utilisation

1. **Sélectionne ta cible** (ton PC ou celui d'un coéquipier) dans le sélecteur en haut
2. **Tape ton instruction** et envoie
3. Le serveur route vers le bon PC qui clique automatiquement dans VS Code

## 👥 Workflow d'équipe

- **Onglet Équipe** : voir qui est en ligne, leurs agents
- **Cliquer "🎯 Piloter"** sur l'agent d'un coéquipier pour prendre la main temporairement
- Tous les messages sont tracés avec l'auteur

## 🔔 Comment Claude envoie des notifs ?

Configure ton hook `Stop` dans `~/.claude/settings.json` pour pinger l'agent local via curl :

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -H 'X-Agent-Token: TON_TOKEN' -H 'Content-Type: application/json' -d '{\"message\":\"✅ Tâche terminée\"}' http://100.83.79.99:3000/api/agent-notify"
          }
        ]
      }
    ]
  }
}
```

## 🔐 Sécurité

- Auth par username/password (PBKDF2)
- Token API par agent (ne pas partager)
- Recommandé : utiliser **uniquement sur Tailscale** (réseau privé chiffré)

## 🐛 Dépannage

- **Agent offline** : vérifie que le script tourne et que serverUrl est correct
- **Messages ne s'envoient pas** : vérifie les coordonnées chatbox dans Settings
- **WebSocket déconnecte** : normal, il reconnecte automatiquement

## 📊 Roadmap

- [ ] Phase 3.2 : Chat intégré entre users
- [ ] Phase 3.3 : Vue stats équipe
- [ ] Phase 4 : Replay vidéo, map projets, voice commands
