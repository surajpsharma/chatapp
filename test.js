'use strict';
/* End-to-end test against the real Next.js server, real API routes and real
 * WebSocket hub. The MongoDB driver is swapped for an in-memory stand-in by
 * test-mock.js (see README) because this environment has no mongod.
 *
 * Uses the plain http module: the sandbox's fetch/undici is unavailable. */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const PORT = 4210;
const HOST = '127.0.0.1';
const DATA_DIR = path.join(__dirname, 'test-data');
const MONGODB_DB = 'nextchat_test';

let passed = 0;
let failed = 0;
const check = (name, cond, extra) => {
  if (cond) {
    passed++;
    console.log('  ok   - ' + name);
  } else {
    failed++;
    console.log('  FAIL - ' + name + (extra !== undefined ? ' :: ' + extra : ''));
  }
};

// By default the driver is swapped for an in-memory stand-in so the suite runs
// anywhere. Set TEST_REAL_MONGO=1 (with MONGODB_URI) to run against a real
// MongoDB instead.
const REAL_MONGO = process.env.TEST_REAL_MONGO === '1';

function startServer() {
  const args = REAL_MONGO
    ? [path.join(__dirname, 'server.js')]
    : ['--require', path.join(__dirname, 'test-mock.js'), path.join(__dirname, 'server.js')];

  const child = spawn('node', args, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: HOST,
      DATA_DIR,
      MONGODB_URI: REAL_MONGO
        ? process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
        : 'mongodb://localhost:27017/' + MONGODB_DB,
      MONGODB_DB,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      if (String(d).includes('running at')) resolve(child);
    });
    child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  });
}

function request(method, pathname, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (cookie) headers['Cookie'] = cookie;

    const req = http.request({ host: HOST, port: PORT, path: pathname, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          /* non-JSON (e.g. HTML page) */
        }
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 80; i++) {
    try {
      await request('GET', '/api/auth/me');
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
}

const cookieOf = (res) => {
  const raw = (res.headers['set-cookie'] || [])[0] || '';
  const m = raw.match(/chat_token=([^;]+)/);
  return m ? `chat_token=${m[1]}` : '';
};

function openSocket(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${HOST}:${PORT}/ws`, { headers: cookie ? { Cookie: cookie } : {} });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextMessage(ws, type, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + type)), timeout);
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(t);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

async function main() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  console.log('\n[1] boot');
  const server = await startServer();
  await waitForHealth();
  const home = await request('GET', '/');
  check('Next app serves / (HTML)', home.status === 200 && /<html/i.test(home.raw), 'got ' + home.status);
  const loginPage = await request('GET', '/login');
  check('serves /login', loginPage.status === 200 && /<html/i.test(loginPage.raw));
  check('unauthenticated /api/auth/me -> 401', (await request('GET', '/api/auth/me')).status === 401);

  console.log('\n[2] registration (username + email + password)');
  let res = await request('POST', '/api/auth/register', {
    body: { username: 'alice', email: 'alice@example.com', password: 'secret1' },
  });
  check('register alice -> 201', res.status === 201, 'got ' + res.status);
  const aliceCookie = cookieOf(res);
  check('session cookie set', aliceCookie.startsWith('chat_token='));
  check('user object has id/username/email',
    res.json.user.username === 'alice' && res.json.user.email === 'alice@example.com');

  res = await request('POST', '/api/auth/register', { body: { username: 'alice', email: 'other@example.com', password: 'secret1' } });
  check('duplicate username -> 409', res.status === 409, 'got ' + res.status);

  res = await request('POST', '/api/auth/register', { body: { username: 'alice2', email: 'ALICE@example.com', password: 'secret1' } });
  check('duplicate email (case-insensitive) -> 409', res.status === 409, 'got ' + res.status);

  res = await request('POST', '/api/auth/register', { body: { username: 'bob', email: 'not-an-email', password: 'secret1' } });
  check('invalid email -> 400', res.status === 400, 'got ' + res.status);

  res = await request('POST', '/api/auth/register', { body: { username: 'bob', email: 'bob@example.com', password: '123' } });
  check('short password -> 400', res.status === 400, 'got ' + res.status);

  res = await request('POST', '/api/auth/register', { body: { username: 'bob', email: 'bob@example.com', password: 'hunter2' } });
  check('register bob -> 201', res.status === 201, 'got ' + res.status);
  const bobCookie = cookieOf(res);

  res = await request('POST', '/api/auth/register', { body: { username: 'carol', email: 'carol@example.com', password: 'secret1' } });
  const carolCookie = cookieOf(res);
  const carolId = res.json.user.id;
  check('register carol -> 201', res.status === 201, 'got ' + res.status);

  res = await request('POST', '/api/auth/register', { body: { username: 'dave', email: 'dave@example.com', password: 'secret1' } });
  const daveCookie = cookieOf(res);
  const daveId = res.json.user.id;
  check('register dave -> 201', res.status === 201, 'got ' + res.status);

  console.log('\n[3] login with email OR username');
  res = await request('POST', '/api/auth/login', { body: { identifier: 'alice@example.com', password: 'secret1' } });
  check('login with email -> 200', res.status === 200, 'got ' + res.status);
  const aliceCookie2 = cookieOf(res) || aliceCookie;

  res = await request('POST', '/api/auth/login', { body: { identifier: 'ALICE', password: 'secret1' } });
  check('login with username (case-insensitive) -> 200', res.status === 200, 'got ' + res.status);

  res = await request('POST', '/api/auth/login', { body: { identifier: 'alice@example.com', password: 'wrong' } });
  check('wrong password -> 401', res.status === 401, 'got ' + res.status);

  console.log('\n[4] people search');
  check('search without auth -> 401', (await request('GET', '/api/users')).status === 401);
  res = await request('GET', '/api/users', { cookie: aliceCookie2 });
  check('no recommendations until a query is typed', res.json.users.length === 0,
    'got ' + res.json.users.length);
  res = await request('GET', '/api/users?q=car', { cookie: aliceCookie2 });
  check('filters by name', res.json.users.length === 1 && res.json.users[0].username === 'carol',
    JSON.stringify(res.json.users));
  res = await request('GET', '/api/users?q=ali', { cookie: aliceCookie2 });
  check('never returns yourself', res.json.users.length === 0);
  res = await request('GET', '/api/users?q=o', { cookie: aliceCookie2 });
  check('partial match returns all hits',
    res.json.users.map((u) => u.username).sort().join(',') === 'bob,carol',
    JSON.stringify(res.json.users.map((u) => u.username)));

  console.log('\n[5] realtime sockets + presence');
  const a = await openSocket(aliceCookie2);
  const presence = await nextMessage(a, 'presence');
  check('presence broadcast on connect', Array.isArray(presence.users) && presence.users.some((u) => u.username === 'alice'));
  const b = await openSocket(bobCookie);
  const bPresence = await nextMessage(b, 'presence');
  check('second user sees both online', bPresence.users.length === 2, bPresence.users.length);

  console.log('\n[6] 1:1 direct message');
  let bobId;
  {
    const list = await request('GET', '/api/users?q=bob', { cookie: aliceCookie2 });
    bobId = list.json.users[0].id;
  }
  res = await request('POST', '/api/conversations', { cookie: aliceCookie2, body: { userId: bobId } });
  check('create direct -> 201', res.status === 201, 'got ' + res.status);
  check('direct type + name is other user', res.json.conversation.type === 'direct' && res.json.conversation.name === 'bob');
  const dmId = res.json.conversation.id;

  const again = await request('POST', '/api/conversations', { cookie: aliceCookie2, body: { userId: bobId } });
  check('creating the same DM is idempotent', again.status === 200 && again.json.created === false,
    again.status + '/' + again.json.created);

  const bobGetsDm = nextMessage(b, 'message');
  res = await request('POST', `/api/conversations/${dmId}/messages`, { cookie: aliceCookie2, body: { body: 'hey bob!' } });
  check('send message -> 201', res.status === 201, 'got ' + res.status);
  const dm = await bobGetsDm;
  check('bob receives it live', dm.message.body === 'hey bob!');
  check('message carries sender name', dm.message.senderName === 'alice');

  res = await request('GET', '/api/conversations', { cookie: bobCookie });
  const bobConv = res.json.conversations.find((c) => c.id === dmId);
  check('bob sees the conversation', !!bobConv);
  check('unread count is 1', bobConv.unread === 1, bobConv.unread);
  check('last message preview', bobConv.lastMessage.body === 'hey bob!');

  res = await request('GET', `/api/conversations/${dmId}/messages`, { cookie: bobCookie });
  check('bob reads history', res.json.messages.length === 1 && res.json.messages[0].body === 'hey bob!');
  check('not seen yet', res.json.messages[0].seen === false);

  const aliceGetsRead = nextMessage(a, 'read');
  res = await request('POST', `/api/conversations/${dmId}/read`, { cookie: bobCookie });
  check('mark read -> count 1', res.status === 200 && res.json.count === 1, JSON.stringify(res.json));
  const readEvt = await aliceGetsRead;
  check('alice is told it was read', readEvt.conversationId === dmId && readEvt.userId);

  res = await request('GET', `/api/conversations/${dmId}/messages`, { cookie: aliceCookie2 });
  check('message now seen', res.json.messages[0].seen === true);

  console.log('\n[7] typing indicator');
  const bobGetsTyping = nextMessage(b, 'typing');
  a.send(JSON.stringify({ type: 'typing', conversationId: dmId, isTyping: true }));
  const typing = await bobGetsTyping;
  check('typing event delivered', typing.isTyping === true && typing.username === 'alice');

  console.log('\n[8] group chat');
  res = await request('POST', '/api/conversations', {
    cookie: aliceCookie2,
    body: { type: 'group', name: 'Weekend plans', memberIds: [bobId, carolId] },
  });
  check('create group -> 201', res.status === 201, 'got ' + res.status);
  const groupId = res.json.conversation.id;
  check('group has 3 members', res.json.conversation.members.length === 3);
  check('creator is admin', res.json.conversation.adminIds.length === 1);

  const carolWs = await openSocket(carolCookie);
  await nextMessage(carolWs, 'presence');
  const carolGetsGroupMsg = nextMessage(carolWs, 'message');
  await request('POST', `/api/conversations/${groupId}/messages`, { cookie: bobCookie, body: { body: 'count me in' } });
  const gm = await carolGetsGroupMsg;
  check('group message reaches another member live', gm.message.body === 'count me in');
  check('group message names the sender', gm.message.senderName === 'bob');

  res = await request('GET', `/api/conversations/${groupId}/messages`, { cookie: carolCookie });
  check('group history readable by member', res.json.messages.length === 1);

  console.log('\n[9] group management');
  res = await request('PATCH', `/api/conversations/${groupId}`, { cookie: aliceCookie2, body: { action: 'rename', name: 'Dream Team' } });
  check('admin can rename', res.status === 200 && res.json.conversation.name === 'Dream Team', JSON.stringify(res.json).slice(0, 80));

  res = await request('PATCH', `/api/conversations/${groupId}`, { cookie: bobCookie, body: { action: 'rename', name: 'Hacked' } });
  check('non-admin cannot rename -> 403', res.status === 403, 'got ' + res.status);

  res = await request('PATCH', `/api/conversations/${groupId}`, { cookie: aliceCookie2, body: { action: 'add', memberIds: [daveId] } });
  check('admin can add a member', res.status === 200 && res.json.conversation.members.length === 4,
    res.json.conversation && res.json.conversation.members.length);

  res = await request('PATCH', `/api/conversations/${groupId}`, { cookie: aliceCookie2, body: { action: 'remove', memberId: daveId } });
  check('admin can remove a member', res.status === 200 && res.json.conversation.members.length === 3);

  res = await request('GET', `/api/conversations/${groupId}/messages`, { cookie: daveCookie });
  check('removed member cannot read the group -> 404', res.status === 404, 'got ' + res.status);

  res = await request('PATCH', `/api/conversations/${groupId}`, { cookie: bobCookie, body: { action: 'leave' } });
  check('member can leave', res.status === 200 && res.json.left === true);
  res = await request('GET', '/api/conversations', { cookie: bobCookie });
  check('left group disappears from their list', !res.json.conversations.some((c) => c.id === groupId));

  console.log('\n[10] deleting messages');
  res = await request('POST', `/api/conversations/${dmId}/messages`, {
    cookie: aliceCookie2,
    body: { body: 'delete me (just for me)' },
  });
  const m1 = res.json.message.id;
  res = await request('DELETE', `/api/conversations/${dmId}/messages/${m1}?scope=me`, { cookie: aliceCookie2 });
  check('delete for me -> ok', res.status === 200, 'got ' + res.status);
  res = await request('GET', `/api/conversations/${dmId}/messages`, { cookie: aliceCookie2 });
  check('gone from my view', !res.json.messages.some((m) => m.id === m1));
  res = await request('GET', `/api/conversations/${dmId}/messages`, { cookie: bobCookie });
  check('still visible to the other person', res.json.messages.some((m) => m.id === m1));

  res = await request('POST', `/api/conversations/${dmId}/messages`, {
    cookie: aliceCookie2,
    body: { body: 'oops, wrong chat' },
  });
  const m2 = res.json.message.id;
  res = await request('DELETE', `/api/conversations/${dmId}/messages/${m2}?scope=everyone`, { cookie: bobCookie });
  check("cannot delete someone else's message for everyone -> 403", res.status === 403, 'got ' + res.status);
  res = await request('DELETE', `/api/conversations/${dmId}/messages/${m2}?scope=everyone`, { cookie: aliceCookie2 });
  check('delete for everyone -> ok', res.status === 200, 'got ' + res.status);
  res = await request('GET', `/api/conversations/${dmId}/messages`, { cookie: bobCookie });
  const tomb = res.json.messages.find((m) => m.id === m2);
  check('tombstone shown to others', !!tomb && tomb.deleted === true && tomb.body === '',
    JSON.stringify(tomb));

  console.log('\n[11] deleting a conversation');
  res = await request('DELETE', `/api/conversations/${dmId}?for=me`, { cookie: aliceCookie2 });
  check('delete chat -> ok', res.status === 200, 'got ' + res.status);
  res = await request('GET', '/api/conversations', { cookie: aliceCookie2 });
  check('gone from my list', !res.json.conversations.some((c) => c.id === dmId));
  res = await request('GET', '/api/conversations', { cookie: bobCookie });
  check("still in the other person's list", res.json.conversations.some((c) => c.id === dmId));
  await request('POST', `/api/conversations/${dmId}/messages`, { cookie: bobCookie, body: { body: 'still here?' } });
  res = await request('GET', '/api/conversations', { cookie: aliceCookie2 });
  check('comes back when messaged again', res.json.conversations.some((c) => c.id === dmId));

  console.log('\n[12] deleting a group');
  res = await request('DELETE', `/api/conversations/${groupId}?for=everyone`, { cookie: carolCookie });
  check('non-admin cannot delete the group -> 403', res.status === 403, 'got ' + res.status);
  res = await request('DELETE', `/api/conversations/${groupId}?for=everyone`, { cookie: aliceCookie2 });
  check('admin deletes group for everyone -> ok', res.status === 200, 'got ' + res.status);
  res = await request('GET', '/api/conversations', { cookie: carolCookie });
  check('group gone for other members too', !res.json.conversations.some((c) => c.id === groupId));
  res = await request('GET', `/api/conversations/${groupId}/messages`, { cookie: aliceCookie2 });
  check('deleted group now 404s', res.status === 404, 'got ' + res.status);

  console.log('\n[13] guards');
  check('messages without auth -> 401', (await request('GET', `/api/conversations/${dmId}/messages`)).status === 401);
  check('bad conversation id -> 404', (await request('GET', '/api/conversations/notanid', { cookie: aliceCookie2 })).status === 404);

  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://${HOST}:${PORT}/ws`);
    ws.on('close', (code) => { check('socket without cookie closed 4001', code === 4001, 'got ' + code); resolve(); });
    ws.on('error', () => resolve());
  });

  a.close(); b.close(); carolWs.close();
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 400));
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  console.log(`\n==== ${passed} passed, ${failed} failed ====`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('test error:', e); process.exit(1); });
