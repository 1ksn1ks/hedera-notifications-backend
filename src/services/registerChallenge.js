// Register challenge: prove the caller owns the wallet before a device
// token is saved for it. The client fetches a nonce, has the connected
// wallet sign the readable message (older apps sign the bare nonce), and
// posts nonce + signature with the register call. Nonces live in memory,
// expire after five minutes, and are single use.
//
// Signature formats accepted:
//  - signatureMap: the base64 protobuf SignatureMap returned by
//    hedera_signMessage (HIP-820). The wallet signs the message with the
//    prefix "\x19Hedera Signed Message:\n" + length, so both the prefixed
//    and the plain message are tried.
//  - raw hex signature (legacy path): 64-byte ED25519, or ECDSA r||s /
//    r||s||v over the plain message.
//
// Grace period: until GRACE_UNTIL (env: ISO date or epoch ms, default
// 2026-11-03T00:00:00Z) unsigned registers are accepted with a warning
// log. A present-but-invalid proof is always 401.

import crypto from 'crypto';
import { MIRROR_URL } from './globeCache.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 10000;
const FETCH_TIMEOUT_MS = 8000;
// Fixed default so a redeploy never pushes the deadline back.
const DEFAULT_GRACE_UNTIL_MS = Date.parse('2026-11-03T00:00:00Z');

// Keyed by nonce, not account: several challenges may be pending for the
// same account and a fresh one does not cancel the previous one.
const challenges = new Map(); // nonce -> { account, expiresAt }

export function issueChallenge(account) {
  const now = Date.now();
  for (const [nonce, entry] of challenges) {
    if (now >= entry.expiresAt) challenges.delete(nonce);
  }
  if (challenges.size >= MAX_PENDING_CHALLENGES) {
    const error = new Error('Too many pending challenges, try again');
    error.status = 429;
    throw error;
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  challenges.set(nonce, { account, expiresAt: now + CHALLENGE_TTL_MS });
  return nonce;
}

// The wallet signs this sentence. The challenge response sends the same
// text in "message" so the app does not assemble it itself.
export function registerMessage(account, nonce) {
  return `Hedera Notifier register ${account} nonce ${nonce}`;
}

// Resolved once at module load. Recomputing it per request would re-read
// the env and, with a "now + 14 days" default, the window would never close.
const GRACE_UNTIL_MS = (() => {
  const raw = process.env.GRACE_UNTIL;
  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
    const ms = Number(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return DEFAULT_GRACE_UNTIL_MS;
})();

export function graceUntil() {
  return GRACE_UNTIL_MS;
}

export function unsignedRegisterAllowed() {
  return Date.now() < GRACE_UNTIL_MS;
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function consumeChallenge(account, nonce) {
  const key = String(nonce);
  const entry = challenges.get(key);
  if (!entry) return fail('No challenge for this account, request one first', 401);
  if (entry.account !== String(account)) {
    return fail('Challenge was issued for a different account', 401);
  }
  if (Date.now() >= entry.expiresAt) {
    challenges.delete(key);
    return fail('Challenge expired, request a new one', 401);
  }
  challenges.delete(key); // single use
  return null;
}

function hexToBuffer(value) {
  let text = String(value || '').trim();
  if (text.startsWith('0x')) text = text.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(text) || text.length % 2 !== 0) return null;
  return Buffer.from(text, 'hex');
}

async function fetchAccountKey(account, fetchImpl, mirrorUrl) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(
      `${mirrorUrl}/api/v1/accounts/${encodeURIComponent(account)}`,
      { signal: controller.signal }
    );
    if (res.status === 404) throw fail('Account not found', 401);
    if (!res.ok) {
      if (res.status >= 500 || res.status === 429) {
        throw fail('Could not check the account, try again', 503);
      }
      throw fail('Could not check the account', 401);
    }
    const json = await res.json();
    const key = json && json.key;
    if (!key) throw fail('Account has no public key', 401);
    if (key._type !== 'ED25519PublicKey' && key._type !== 'ECDSASecp256k1PublicKey') {
      throw fail("Cannot verify this account's key", 401);
    }
    const thumbprint =
      key.keys && key.keys.length === 1 ? key.keys[0].thumbprint : null;
    if (!thumbprint) throw fail("Cannot verify this account's key", 401);
    return { type: key._type, thumbprint };
  } finally {
    clearTimeout(timerId);
  }
}

// --- Minimal SignatureMap protobuf decoder (no new dependency). --------
//
//   SignatureMap { map<PublicKey, SignaturePair> sig_map = 1; }
//   PublicKey    { oneof key { bytes ed25519 = 1; bytes secp256k1 = 2; } }
//   SignaturePair{ oneof signature { bytes ed25519 = 1;
//                                   bytes ecdsa_secp256k1 = 2; } }

function readVarint(buffer, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  for (;;) {
    if (pos >= buffer.length) throw new Error('Truncated varint');
    const byte = buffer[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [result, pos];
    shift += 7n;
  }
}

function readFields(buffer, start, end) {
  const fields = new Map();
  let pos = start;
  while (pos < end) {
    let tag;
    [tag, pos] = readVarint(buffer, pos);
    const field = Number(tag >> 3n);
    if (Number(tag & 7n) !== 2) throw new Error('Unexpected wire type');
    let len;
    [len, pos] = readVarint(buffer, pos);
    if (pos + Number(len) > end) throw new Error('Truncated field');
    const value = buffer.subarray(pos, pos + Number(len));
    fields.set(field, [...(fields.get(field) || []), value]);
    pos += Number(len);
  }
  return fields;
}

export function decodeSignatureMap(input) {
  const text = String(input || '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length < 12) return null;
  let buffer;
  try {
    buffer = Buffer.from(text, 'base64');
  } catch {
    return null;
  }
  try {
    const outer = readFields(buffer, 0, buffer.length);
    for (const entry of outer.get(1) || []) {
      const inner = readFields(entry, 0, entry.length);
      const keyFields = inner.get(1) || [];
      const sigFields = inner.get(2) || [];
      if (keyFields.length === 0 || sigFields.length === 0) continue;
      const keyMap = readFields(keyFields[0], 0, keyFields[0].length);
      const sigMap = readFields(sigFields[0], 0, sigFields[0].length);
      const isEd25519Key = keyMap.has(1);
      // readFields groups repeated fields into arrays, so take the first.
      const pub = (keyMap.get(1) || keyMap.get(2) || [])[0];
      const sig = (sigMap.get(1) || sigMap.get(2) || [])[0];
      if (!pub || !sig) continue;
      return {
        isEd25519: isEd25519Key,
        pub: Buffer.from(pub),
        sig: Buffer.from(sig),
      };
    }
  } catch {
    return null; // not a SignatureMap after all
  }
  return null;
}

// --- Key + signature verification. -------------------------------------

// secp256k1 field prime (p ≡ 3 mod 4, so sqrt(a) = a^((p+1)/4)).
const SECP256K1_P = 2n ** 256n - 2n ** 32n - 977n;

function modPow(base, exp, mod) {
  base %= mod;
  let result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

function bufferToBig(buffer) {
  return buffer.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
}

function bigToBuffer(value) {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return Buffer.from(out);
}

// Node's one-shot crypto.verify needs KeyObjects, so rebuild each key type
// from its mirror-node thumbprint. ECDSA thumbprints are compressed
// (02/03 || x); the y coordinate is recovered from the curve equation.
function keyObjectFor(accountKey) {
  if (accountKey.type === 'ED25519PublicKey') {
    const raw = Buffer.from(accountKey.thumbprint, 'hex');
    if (raw.length !== 32) return null;
    try {
      return crypto.createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
        format: 'jwk',
      });
    } catch {
      return null;
    }
  }

  const point = Buffer.from(accountKey.thumbprint, 'hex');
  if (point.length !== 33 || (point[0] !== 0x02 && point[0] !== 0x03)) {
    return null;
  }
  const x = point.subarray(1);
  const rhs = (modPow(bufferToBig(x), 3n, SECP256K1_P) + 7n) % SECP256K1_P;
  let y = modPow(rhs, (SECP256K1_P + 1n) / 4n, SECP256K1_P);
  if ((y % 2n) !== (point[0] === 0x03 ? 1n : 0n)) y = SECP256K1_P - y;
  if (modPow(y, 2n, SECP256K1_P) !== rhs) return null; // not on the curve
  try {
    return crypto.createPublicKey({
      key: {
        kty: 'EC',
        crv: 'secp256k1',
        x: x.toString('base64url'),
        y: bigToBuffer(y).toString('base64url'),
      },
      format: 'jwk',
    });
  } catch {
    return null;
  }
}

// Wallets return ECDSA signatures as raw r||s (64 bytes) or r||s||v (65).
// This Node build rejects dsaEncoding 'p1363' in crypto.verify options, so
// re-encode r||s as DER and verify with the default encoding.
function derSignature(rs64) {
  const derInt = (bytes) => {
    let body = bytes;
    while (body.length > 1 && body[0] === 0) body = body.subarray(1);
    if (body[0] & 0x80) body = Buffer.concat([Buffer.from([0]), body]);
    return Buffer.concat([Buffer.from([0x02, body.length]), body]);
  };
  const r = derInt(rs64.subarray(0, 32));
  const s = derInt(rs64.subarray(32));
  return Buffer.concat([Buffer.from([0x30, r.length + s.length]), r, s]);
}

function signedForms(text) {
  const plain = Buffer.from(text, 'utf8');
  const prefixed = Buffer.concat([
    Buffer.from('\x19Hedera Signed Message:\n' + plain.length, 'utf8'),
    plain,
  ]);
  return [prefixed, plain];
}

function checkSignature(keyObject, accountKey, sig, message) {
  if (accountKey.type === 'ED25519PublicKey') {
    if (sig.length !== 64) return false;
    try {
      return crypto.verify(null, message, keyObject, sig);
    } catch {
      return false;
    }
  }

  const rs = sig.length === 65 ? sig.subarray(0, 64) : sig;
  if (rs.length !== 64) return false;
  const derSig = derSignature(rs);
  // Hedera ECDSA keys digest with SHA-384, some wallets use SHA-256.
  for (const hash of ['sha384', 'sha256']) {
    try {
      if (crypto.verify(hash, message, keyObject, derSig)) return true;
    } catch {
      // bad key material — fall through
    }
  }
  return false;
}

export async function verifyWalletSignature(
  { account, nonce, signature },
  { fetchImpl = globalThis.fetch, mirrorUrl = MIRROR_URL } = {}
) {
  const problem = consumeChallenge(account, nonce);
  if (problem) throw problem;

  const key = await fetchAccountKey(account, fetchImpl, mirrorUrl);
  const keyObject = keyObjectFor(key);
  if (!keyObject) throw fail("Cannot verify this account's key", 401);

  // Readable message first, then the bare nonce the previous app signed.
  // HIP-820 prefixes the bytes with "\x19Hedera Signed Message:\n" + length,
  // so each text is tried with that prefix and without it.
  const messages = [
    ...signedForms(registerMessage(account, nonce)),
    ...signedForms(String(nonce)),
  ];

  // Candidate signatures: the decoded SignatureMap (when the input is one)
  // plus the legacy raw-hex interpretation.
  const candidates = [];
  const decoded = decodeSignatureMap(signature);
  if (decoded) {
    const accountIsEd25519 = key.type === 'ED25519PublicKey';
    const sameKey = decoded.pub.equals(Buffer.from(key.thumbprint, 'hex'));
    const sameType = decoded.isEd25519 === accountIsEd25519;
    if (sameKey && sameType) candidates.push(decoded.sig);
  }
  const rawHex = hexToBuffer(signature);
  if (rawHex && !candidates.includes(rawHex)) candidates.push(rawHex);

  for (const sig of candidates) {
    for (const message of messages) {
      if (checkSignature(keyObject, key, sig, message)) return;
    }
  }
  throw fail('Signature check failed', 401);
}
