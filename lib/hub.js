'use strict';

/* The WebSocket hub is created by the custom server (server.js) and stashed on
 * globalThis, so Next route handlers — which are bundled separately — can reach
 * the same instance at runtime. */

function setHub(hub) {
  globalThis.__chatHub = hub;
}

function getHub() {
  return globalThis.__chatHub || null;
}

module.exports = { setHub, getHub };
