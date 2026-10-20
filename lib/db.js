'use strict';

/* MongoDB connection. Cached on globalThis so the Next server and the
 * WebSocket hub (which live in the same process) share one pool. */

const { MongoClient, ObjectId } = require('mongodb');

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'nextchat';

let cache = globalThis.__mongoCache;
if (!cache) cache = globalThis.__mongoCache = { client: null, db: null, promise: null };

async function ensureIndexes(db) {
  await db.collection('users').createIndex({ usernameLower: 1 }, { unique: true });
  await db.collection('users').createIndex({ emailLower: 1 }, { unique: true });
  await db.collection('conversations').createIndex({ members: 1 });
  await db.collection('conversations').createIndex({ lastMessageAt: -1 });
  await db.collection('messages').createIndex({ conversationId: 1, _id: -1 });
}

async function getDb() {
  if (cache.db) return cache.db;
  if (!cache.promise) {
    cache.promise = MongoClient.connect(URI, { serverSelectionTimeoutMS: 5000 })
      .then(async (client) => {
        const db = client.db(DB_NAME);
        await ensureIndexes(db);
        cache.client = client;
        cache.db = db;
        return db;
      })
      .catch((e) => {
        cache.promise = null;
        throw e;
      });
  }
  return cache.promise;
}

async function collections() {
  const db = await getDb();
  return {
    users: db.collection('users'),
    conversations: db.collection('conversations'),
    messages: db.collection('messages'),
  };
}

const isValidId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
const oid = (id) => new ObjectId(String(id));

module.exports = { getDb, collections, ObjectId, oid, isValidId, URI, DB_NAME };
