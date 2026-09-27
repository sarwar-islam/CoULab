// ============================================================================
// DLAS Cryptographic helpers (PIN hashing, SHA-256 hashing, e-Signatures).
// ============================================================================
'use strict';

const crypto = require('crypto');

function hashPin(pin) {
  return crypto.createHash("sha256").update(`dlas-demo:${pin}`).digest("hex");
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

module.exports = {
  hashPin,
  sha256
};
