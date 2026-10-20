'use strict';
/* Test preload: swap the real MongoDB driver for an in-memory stand-in, so the
 * whole app (Next routes + the WebSocket hub) can be exercised end to end
 * without a running mongod. Application code is untouched.
 * Loaded via `node --require ./test-mock.js server.js`. */

const Module = require('module');
const originalLoad = Module._load;
const mock = require('mongo-mock');

mock.max_delay = 0;

Module._load = function (request) {
  if (request === 'mongodb') return mock;
  return originalLoad.apply(this, arguments);
};
