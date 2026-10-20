'use strict';

/* Password hashing and session tokens. */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const COOKIE = 'chat_token';
const TOKEN_TTL = '7d';
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');

// A persistent secret, so sessions survive a server restart. Set JWT_SECRET
// explicitly in production.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, '.secret');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  } catch {
    return 'insecure-fallback-secret';
  }
}

const JWT_SECRET = loadSecret();

const hashPassword = (plain) => bcrypt.hashSync(plain, 10);
const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

const signToken = (user) =>
  jwt.sign({ uid: String(user._id) }, JWT_SECRET, { expiresIn: TOKEN_TTL });

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60,
  secure: process.env.NODE_ENV === 'production',
});

module.exports = {
  COOKIE,
  JWT_SECRET,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  cookieOptions,
};
