# Chat — Next.js

A full-stack chat app built with **Next.js** (App Router) and **MongoDB**, with
email accounts, **1:1 direct messages**, **group chats** with full group
management, and **real-time** delivery over WebSockets. Instagram-style
conversation list and message bubbles, responsive down to a phone.

## Requirements

- Node.js 18 or newer
- A MongoDB server (local `mongod` or a hosted cluster such as Atlas)

## Setup

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env      # then edit MONGODB_URI and set JWT_SECRET

# 3. build and run (production)
npm run build
npm start
```

Open **http://localhost:3000**, create an account, and you land on the chat.

For day-to-day development, `npm run dev` runs the same server with hot reload:

```bash
npm run dev
```

> Note: `next dev` and `next build` share the `.next` directory, so if you run
> `npm run dev` after a production build you must `npm run build` again before
> `npm start`.

### Getting a MongoDB

Local:

```bash
docker compose up -d mongo
# MONGODB_URI=mongodb://127.0.0.1:27017
```

MongoDB data is persisted in the `mongo_data` Docker volume. Stop the service
with `docker compose down`; to also delete its data, run
`docker compose down -v`.

Or point `MONGODB_URI` at an Atlas cluster:
`mongodb+srv://user:pass@cluster.mongodb.net/nextchat`.

## Features

**Accounts**
- Sign up with **username + email + password**.
- Sign in with **either the email or the username**.
- Passwords hashed with bcrypt; sessions are a signed JWT in an httpOnly cookie.
- Username and email are unique (case-insensitive), enforced by MongoDB indexes.

**Direct messages**
- Search people by name and start a 1:1 conversation.
- Nothing is suggested until you actually search — no unsolicited people list.
- Reopening the same person reuses the existing conversation.

**Groups** (WhatsApp-style)
- Create a group with a name and chosen members.
- Rename the group, add members, remove members — admins only.
- Admin role; the creator is an admin, and if an admin leaves, another member is
  promoted so the group always has one.
- Leave the group; an empty group is deleted.

**Deleting**
- **Delete a message** — *for everyone* (only your own) or *for me* only. A
  deleted-for-everyone message becomes "This message was deleted" for all.
- **Delete a chat** — removes it from your list only; it reappears if the other
  person messages you again.
- **Delete a group for everyone** — admin only; removes it for every member.

**Real-time** (one WebSocket per client)
- New messages appear instantly for everyone in the conversation.
- **Typing indicators** ("bob is typing…").
- **Online presence** (green dots, updated live).
- **Read receipts** — "Seen" on your last message.
- **Unread badges** per conversation.

## Architecture

```
server.js            Custom Node server: runs Next AND hosts the WebSocket hub
next.config.js       Keeps the MongoDB driver external
lib/db.js            Mongo connection + indexes (cached on globalThis)
lib/auth.js          bcrypt hashing, JWT sessions, cookie options
lib/store.js         All data operations (users, conversations, messages)
lib/hub.js           Lets API routes reach the WebSocket hub instance
app/                 Pages (App Router) and API routes
components/          Client UI (ChatApp, modals, group panel, avatar)
```

Why a custom server: Next's route handlers can't hold a WebSocket open, so
`server.js` serves the Next app and upgrades `/ws` on the same HTTP server. That
keeps it to **one process and one command**. API routes publish to the hub
through a `globalThis` reference, so a message saved over HTTP is pushed to
every connected member immediately.

## Data model

```
users          { _id, username, usernameLower*, email, emailLower*, passwordHash, createdAt }
conversations  { _id, type: 'direct'|'group', name, members[], admins[], createdBy,
                 createdAt, lastMessageAt, lastMessageText, lastMessageSender }
messages       { _id, conversationId, senderId, body, createdAt, readBy[] }

* unique index
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | `{ username, email, password }` |
| `POST` | `/api/auth/login` | `{ identifier, password }` — email or username |
| `POST` | `/api/auth/logout` | clears the session cookie |
| `GET` | `/api/auth/me` | current user |
| `GET` | `/api/users?q=` | search people (excludes you) |
| `GET` | `/api/conversations` | my conversations + online ids |
| `POST` | `/api/conversations` | `{ userId }` or `{ type:'group', name, memberIds }` |
| `GET` | `/api/conversations/:id` | details + members |
| `PATCH` | `/api/conversations/:id` | `{ action: 'rename'\|'add'\|'remove'\|'leave', ... }` |
| `DELETE` | `/api/conversations/:id?for=me` | delete the chat from my list |
| `DELETE` | `/api/conversations/:id?for=everyone` | delete a group for all (admin) |
| `GET` | `/api/conversations/:id/messages` | history (oldest first, `?before=&limit=`) |
| `POST` | `/api/conversations/:id/messages` | `{ body }` |
| `DELETE` | `/api/conversations/:id/messages/:messageId?scope=` | `everyone` or `me` |
| `POST` | `/api/conversations/:id/read` | mark read |

WebSocket `/ws` (authenticated by the session cookie):

- client → server: `{ type: 'typing', conversationId, isTyping }`
- server → client:
  - `{ type: 'message', conversationId, message }`
  - `{ type: 'typing', conversationId, userId, username, isTyping }`
  - `{ type: 'presence', users: [{ id, username }] }`
  - `{ type: 'read', conversationId, userId }`
  - `{ type: 'message:deleted', conversationId, messageId, scope, userId }`
  - `{ type: 'conversation:removed', conversationId, userId }` — chat deleted for me
  - `{ type: 'conversation:deleted', conversationId }` — group deleted for everyone
  - `{ type: 'conversation', conversationId }` — list changed, refetch

## Testing

```bash
npm test
```

Boots the real Next.js server and exercises the actual API routes and WebSocket
hub: registration and validation, email/username login, duplicate rejection,
people search (including "nothing until you search"), direct messages, live
delivery, unread counts, read receipts, typing, group creation, admin
permissions, add/remove/leave, message deletion (both scopes), chat deletion,
group deletion, and the auth guards — **68 checks**.

By default the suite swaps the MongoDB driver for an in-memory stand-in
(`test-mock.js` + `mongo-mock`) so it runs with no database. To run against a
real MongoDB instead:

```bash
TEST_REAL_MONGO=1 MONGODB_URI=mongodb://127.0.0.1:27017 npm test
```

## Notes for production

- Set a strong `JWT_SECRET` and run behind HTTPS (`NODE_ENV=production` marks
  the cookie `Secure`).
- Use a scoped MongoDB user, not an unauthenticated local server.
- Add rate limiting on `/api/auth/register` and `/api/auth/login`.
- Add pagination in the UI (the API supports `?before=`).
- To scale beyond one instance you'd move the WebSocket fan-out to a shared
  pub/sub (e.g. Redis), since the hub is in-process.
