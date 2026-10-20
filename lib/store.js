'use strict';

/* All data operations. Everything the API routes and the WebSocket hub need
 * lives here, so the same logic is exercised by the tests. */

const { collections, ObjectId, oid, isValidId } = require('./db');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


function publicUser(u) {
  if (!u) return null;
  return { id: String(u._id), username: u.username, email: u.email };
}

function messageView(m, senderName) {
  const readBy = (m.readBy || []).map(String);
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    senderName: senderName || null,
    body: m.deleted ? '' : m.body,
    deleted: !!m.deleted,
    createdAt: (m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt)).toISOString(),
    readBy,
    seen: readBy.length > 0,
  };
}

/* ---------------- validation ---------------- */

function validateRegistration({ username, email, password }) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
    return 'Username must be 3-20 characters: letters, numbers or underscore.';
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'Please enter a valid email address.';
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return 'Password must be at least 6 characters.';
  }
  return null;
}

/* ---------------- users ---------------- */

async function createUser({ username, email, passwordHash }) {
  const { users } = await collections();
  const doc = {
    username: username.trim(),
    usernameLower: username.trim().toLowerCase(),
    email: email.trim(),
    emailLower: email.trim().toLowerCase(),
    passwordHash,
    createdAt: new Date(),
  };
  const info = await users.insertOne(doc);
  return { ...doc, _id: info.insertedId };
}

// Sign in with either the email address or the username.
async function findUserByLogin(identifier) {
  const { users } = await collections();
  const key = String(identifier || '').trim().toLowerCase();
  if (!key) return null;
  const byEmail = await users.findOne({ emailLower: key });
  if (byEmail) return byEmail;
  return users.findOne({ usernameLower: key });
}

async function findUserById(id) {
  if (!isValidId(id)) return null;
  const { users } = await collections();
  return users.findOne({ _id: oid(id) });
}

// Name search for the "new chat" picker. The text match is done in the app
// rather than with a $regex so the behaviour is identical everywhere; the
// candidate set is capped.
async function searchUsers(q, excludeId, limit = 30) {
  const { users } = await collections();
  const term = String(q || '').trim().toLowerCase();
  const filter = {};
  if (excludeId && isValidId(excludeId)) filter._id = { $ne: oid(excludeId) };

  const docs = await users.find(filter).limit(500).toArray();
  return docs
    .filter((u) => !term || String(u.usernameLower || '').includes(term))
    .map(publicUser)
    .sort((a, b) => a.username.localeCompare(b.username))
    .slice(0, limit);
}

async function usersByIds(ids) {
  const valid = ids.filter(isValidId).map(oid);
  if (!valid.length) return [];
  const { users } = await collections();
  return users.find({ _id: { $in: valid } }).toArray();
}

/* ---------------- conversations ---------------- */

function conversationView(conv, meId, memberUsers, unread) {
  const members = (conv.members || []).map((m) => {
    const u = memberUsers.get(String(m));
    return { id: String(m), username: u ? u.username : 'unknown' };
  });
  const isDirect = conv.type === 'direct';
  const other = isDirect ? members.find((m) => m.id !== String(meId)) : null;
  return {
    id: String(conv._id),
    type: conv.type,
    name: isDirect ? (other ? other.username : 'Direct message') : conv.name,
    members,
    memberIds: members.map((m) => m.id),
    adminIds: (conv.admins || []).map(String),
    createdBy: conv.createdBy ? String(conv.createdBy) : null,
    lastMessage: conv.lastMessageText
      ? {
          body: conv.lastMessageText,
          senderId: conv.lastMessageSender ? String(conv.lastMessageSender) : null,
          createdAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
        }
      : null,
    unread: unread || 0,
    updatedAt: conv.lastMessageAt
      ? new Date(conv.lastMessageAt).toISOString()
      : new Date(conv.createdAt || Date.now()).toISOString(),
  };
}

async function hydrateMembers(convs) {
  const ids = new Set();
  convs.forEach((c) => (c.members || []).forEach((m) => ids.add(String(m))));
  const users = await usersByIds([...ids]);
  return new Map(users.map((u) => [String(u._id), u]));
}

async function listConversations(meId) {
  const { conversations, messages } = await collections();
  const uid = oid(meId);
  const all = await conversations.find({ members: uid }).toArray();
  // Chats the user has deleted stay hidden until someone messages again.
  const convs = all.filter((c) => !(c.deletedFor || []).some((x) => String(x) === String(meId)));
  convs.sort((a, b) => {
    const at = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
    const bt = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
    return bt - at;
  });

  const memberUsers = await hydrateMembers(convs);
  const out = [];
  for (const conv of convs) {
    const unread = await messages.countDocuments({
      conversationId: conv._id,
      senderId: { $ne: uid },
      readBy: { $ne: uid },
    });
    out.push(conversationView(conv, meId, memberUsers, unread));
  }
  return out;
}

async function getConversation(convId, meId) {
  if (!isValidId(convId)) return null;
  const { conversations } = await collections();
  const conv = await conversations.findOne({ _id: oid(convId) });
  if (!conv) return null;
  if (!(conv.members || []).some((m) => String(m) === String(meId))) return null;
  if ((conv.deletedFor || []).some((x) => String(x) === String(meId))) return null;
  const memberUsers = await hydrateMembers([conv]);
  return conversationView(conv, meId, memberUsers, 0);
}

// Find the existing 1:1 conversation between two people, if there is one.
async function findDirectConversation(aId, bId) {
  const { conversations } = await collections();
  const convs = await conversations.find({ type: 'direct', members: oid(aId) }).toArray();
  return (
    convs.find(
      (c) => c.members.length === 2 && c.members.some((m) => String(m) === String(bId))
    ) || null
  );
}

async function createDirectConversation(aId, bId) {
  const existing = await findDirectConversation(aId, bId);
  if (existing) return { conv: existing, created: false };

  const { conversations } = await collections();
  const doc = {
    type: 'direct',
    name: null,
    members: [oid(aId), oid(bId)],
    admins: [],
    deletedFor: [],
    createdBy: oid(aId),
    createdAt: new Date(),
    lastMessageAt: null,
    lastMessageText: null,
    lastMessageSender: null,
  };
  const info = await conversations.insertOne(doc);
  return { conv: { ...doc, _id: info.insertedId }, created: true };
}

async function createGroupConversation(creatorId, name, memberIds) {
  const { conversations } = await collections();
  const members = [...new Set([String(creatorId), ...memberIds.filter(isValidId)])].map(oid);
  const doc = {
    type: 'group',
    name: String(name || 'New group').trim().slice(0, 60) || 'New group',
    members,
    admins: [oid(creatorId)],
    deletedFor: [],
    createdBy: oid(creatorId),
    createdAt: new Date(),
    lastMessageAt: null,
    lastMessageText: null,
    lastMessageSender: null,
  };
  const info = await conversations.insertOne(doc);
  return { ...doc, _id: info.insertedId };
}

/* ---------------- group management ---------------- */

async function renameGroup(convId, meId, name) {
  const { conversations } = await collections();
  const conv = await conversations.findOne({ _id: oid(convId) });
  if (!conv || conv.type !== 'group') return { error: 'Group not found.' };
  if (!isAdmin(conv, meId)) return { error: 'Only admins can rename the group.' };
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return { error: 'Group name cannot be empty.' };
  await conversations.updateOne({ _id: conv._id }, { $set: { name: clean } });
  return { ok: true };
}

async function addMembers(convId, meId, memberIds) {
  const { conversations } = await collections();
  const conv = await conversations.findOne({ _id: oid(convId) });
  if (!conv || conv.type !== 'group') return { error: 'Group not found.' };
  if (!isAdmin(conv, meId)) return { error: 'Only admins can add members.' };
  const existing = new Set(conv.members.map(String));
  const toAdd = memberIds.filter((id) => isValidId(id) && !existing.has(String(id)));
  if (!toAdd.length) return { ok: true, added: 0 };
  const members = [...conv.members, ...toAdd.map(oid)];
  await conversations.updateOne({ _id: conv._id }, { $set: { members } });
  return { ok: true, added: toAdd.length };
}

async function removeMember(convId, meId, memberId) {
  const { conversations } = await collections();
  const conv = await conversations.findOne({ _id: oid(convId) });
  if (!conv || conv.type !== 'group') return { error: 'Group not found.' };
  if (!isAdmin(conv, meId)) return { error: 'Only admins can remove members.' };
  if (String(memberId) === String(meId)) return { error: 'Use "leave group" to remove yourself.' };
  const members = conv.members.filter((m) => String(m) !== String(memberId));
  const admins = (conv.admins || []).filter((a) => String(a) !== String(memberId));
  await conversations.updateOne({ _id: conv._id }, { $set: { members, admins } });
  return { ok: true };
}

async function leaveGroup(convId, meId) {
  const { conversations } = await collections();
  const conv = await conversations.findOne({ _id: oid(convId) });
  if (!conv || conv.type !== 'group') return { error: 'Group not found.' };
  const remaining = conv.members.filter((m) => String(m) !== String(meId));
  if (!remaining.length) {
    await conversations.deleteOne({ _id: conv._id });
    return { ok: true, deleted: true };
  }
  // If an admin leaves, promote the next member so the group keeps an admin.
  let admins = (conv.admins || []).filter((a) => String(a) !== String(meId));
  if (!admins.length) admins = [remaining[0]];
  await conversations.updateOne(
    { _id: conv._id },
    { $set: { members: remaining, admins } }
  );
  return { ok: true };
}

function isAdmin(conv, meId) {
  return (conv.admins || []).some((a) => String(a) === String(meId));
}

/* ---------------- messages ---------------- */

async function listMessages(convId, meId, { limit = 50, before } = {}) {
  const conv = await getConversation(convId, meId);
  if (!conv) return null;

  const { messages, users } = await collections();
  const filter = { conversationId: oid(convId) };
  if (before && isValidId(before)) filter._id = { $lt: oid(before) };

  const found = await messages.find(filter).sort({ _id: -1 }).limit(Math.min(limit, 100)).toArray();
  found.reverse();
  // Hide messages this user deleted just for themselves.
  const docs = found.filter((d) => !(d.deletedFor || []).some((x) => String(x) === String(meId)));

  const senders = await usersByIds([...new Set(docs.map((d) => String(d.senderId)))]);
  const nameById = new Map(senders.map((u) => [String(u._id), u.username]));

  return docs.map((d) => messageView(d, nameById.get(String(d.senderId))));
}

async function createMessage(convId, meId, body) {
  const conv = await getConversation(convId, meId);
  if (!conv) return { error: 'Conversation not found.' };

  const text = String(body || '').trim().slice(0, 2000);
  if (!text) return { error: 'Message cannot be empty.' };

  const { messages, conversations, users } = await collections();
  const now = new Date();
  const doc = {
    conversationId: oid(convId),
    senderId: oid(meId),
    body: text,
    createdAt: now,
    readBy: [],
  };
  const info = await messages.insertOne(doc);
  await conversations.updateOne(
    { _id: oid(convId) },
    {
      $set: {
        lastMessageAt: now,
        lastMessageText: text,
        lastMessageSender: oid(meId),
        // A new message brings a deleted chat back for everyone.
        deletedFor: [],
      },
    }
  );

  const me = await users.findOne({ _id: oid(meId) });
  return {
    message: messageView({ ...doc, _id: info.insertedId }, me ? me.username : null),
    memberIds: conv.memberIds,
  };
}

// Mark every message from other people in this conversation as read by me.
async function markRead(convId, meId) {
  const conv = await getConversation(convId, meId);
  if (!conv) return { error: 'Conversation not found.' };

  const { messages } = await collections();
  const res = await messages.updateMany(
    {
      conversationId: oid(convId),
      senderId: { $ne: oid(meId) },
      readBy: { $ne: oid(meId) },
    },
    { $push: { readBy: oid(meId) } }
  );
  return { ok: true, count: res.modifiedCount, memberIds: conv.memberIds };
}

/* ---------------- deletes ---------------- */

// Remove a conversation from *my* list. It comes back if someone messages again.
async function deleteConversation(convId, meId) {
  if (!isValidId(convId)) return { error: 'Conversation not found.' };
  const { conversations } = await collections();
  const conv = await conversations.findOne({ _id: oid(convId) });
  if (!conv || !(conv.members || []).some((m) => String(m) === String(meId))) {
    return { error: 'Conversation not found.' };
  }
  const deletedFor = [...new Set([...(conv.deletedFor || []).map(String), String(meId)])].map(oid);
  await conversations.updateOne({ _id: conv._id }, { $set: { deletedFor } });
  return { ok: true };
}

// Delete a group for everyone (admin only).
async function deleteGroup(convId, meId) {
  if (!isValidId(convId)) return { error: 'Group not found.' };
  const { conversations } = await collections();
  const conv = await conversations.findOne({ _id: oid(convId) });
  if (!conv || conv.type !== 'group') return { error: 'Group not found.' };
  if (!isAdmin(conv, meId)) return { error: 'Only admins can delete the group.' };
  await conversations.deleteOne({ _id: conv._id });
  return { ok: true, memberIds: conv.members.map(String) };
}

// scope 'everyone' (sender only) or 'me'.
async function deleteMessage(convId, messageId, meId, scope) {
  const conv = await getConversation(convId, meId);
  if (!conv) return { error: 'Conversation not found.' };
  if (!isValidId(messageId)) return { error: 'Message not found.' };

  const { messages } = await collections();
  const msg = await messages.findOne({ _id: oid(messageId), conversationId: oid(convId) });
  if (!msg) return { error: 'Message not found.' };

  if (scope === 'everyone') {
    if (String(msg.senderId) !== String(meId)) {
      return { error: 'You can only delete your own messages for everyone.' };
    }
    await messages.updateOne({ _id: msg._id }, { $set: { deleted: true, body: '' } });
  } else {
    const deletedFor = [...new Set([...(msg.deletedFor || []).map(String), String(meId)])].map(oid);
    await messages.updateOne({ _id: msg._id }, { $set: { deletedFor } });
  }
  return { ok: true, scope, memberIds: conv.memberIds };
}

module.exports = {
  USERNAME_RE,
  EMAIL_RE,
  publicUser,
  validateRegistration,
  createUser,
  findUserByLogin,
  findUserById,
  searchUsers,
  usersByIds,
  listConversations,
  getConversation,
  createDirectConversation,
  createGroupConversation,
  renameGroup,
  addMembers,
  removeMember,
  leaveGroup,
  isAdmin,
  listMessages,
  createMessage,
  markRead,
  deleteConversation,
  deleteGroup,
  deleteMessage,
};
