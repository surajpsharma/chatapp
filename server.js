'use strict';

/* Custom Next.js server. It serves the Next app AND hosts the WebSocket
 * endpoint at /ws, so messaging is genuinely real-time in one process. */

const http = require('http');
const next = require('next');
const { WebSocketServer } = require('ws');
const { loadEnvConfig } = require('@next/env');

// Load .env files BEFORE anything reads process.env (our own lib/ modules read
// MONGODB_URI and JWT_SECRET at require time).
loadEnvConfig(process.cwd());

const auth = require('./lib/auth');
const store = require('./lib/store');
const { setHub } = require('./lib/hub');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// userId -> { username, sockets: Set<WebSocket> }
const online = new Map();
const wss = new WebSocketServer({ noServer: true });

function onlineList() {
  return [...online.entries()].map(([id, v]) => ({ id, username: v.username }));
}

const hub = {
  broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  },
  toUsers(ids, payload) {
    const targets = new Set(ids.map(String));
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1 && targets.has(String(client.userId))) client.send(data);
    }
  },
  onlineIds() {
    return [...online.keys()];
  },
  presence() {
    hub.broadcast({ type: 'presence', users: onlineList() });
  },
};
setHub(hub);

app.prepare().then(() => {
  const server = http.createServer((req, res) => handle(req, res));

  server.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      /* ignore */
    }
    if (pathname !== '/ws') return; // leave other upgrades (e.g. Next HMR) alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', async (ws, req) => {
    let userId = null;
    let username = null;
    try {
      const raw = (req.headers.cookie || '')
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(auth.COOKIE + '='));
      const token = raw ? decodeURIComponent(raw.slice(auth.COOKIE.length + 1)) : null;
      const payload = token && auth.verifyToken(token);
      if (payload) {
        const user = await store.findUserById(payload.uid);
        if (user) {
          userId = String(user._id);
          username = user.username;
        }
      }
    } catch {
      /* fall through to close */
    }

    if (!userId) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.userId = userId;
    if (!online.has(userId)) online.set(userId, { username, sockets: new Set() });
    online.get(userId).sockets.add(ws);
    hub.presence();

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'typing' && msg.conversationId) {
        const conv = await store.getConversation(msg.conversationId, userId);
        if (!conv) return;
        hub.toUsers(
          conv.memberIds.filter((id) => id !== userId),
          {
            type: 'typing',
            conversationId: conv.id,
            userId,
            username,
            isTyping: !!msg.isTyping,
          }
        );
      }
    });

    ws.on('close', () => {
      const entry = online.get(userId);
      if (entry) {
        entry.sockets.delete(ws);
        if (!entry.sockets.size) online.delete(userId);
      }
      hub.presence();
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Chat running at http://localhost:${port}`);
  });
});

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection', err);
});
