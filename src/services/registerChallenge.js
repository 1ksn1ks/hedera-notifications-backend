// Register challenge: prove the caller owns the wallet before a device
// token is saved for it. The client fetches a nonce, has the connected
// wallet sign it, and posts nonce + signature with the register call.
// Nonces live in memory, expire after five minutes, and are single use.

import crypto from 'crypto';
import { MIRROR_URL } from './globeCache.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 10000;
const FETCH_TIMEOUT_MS = 8000;

const challenges = new Map(); // account -> { nonce, expiresAt }

export function issueChallenge(account) {
  const now = Date.now();
  for (const [key, entry] of challenges) {
    if (now >= entry.expiresAt) challenges.delete(key);
  }
  if (challenges.size >= MAX_PENDING_CHALLENGES) {
    const error = new Error('Too many pending challenges, try again');
    error.status = 429;
    throw error;
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  challenges.set(account, { nonce, expiresAt: now + CHALLENGE_TTL_MS });
  return nonce;
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function consumeChallenge(account, nonce) {
  const entry = challenges.get(account);
  if (!entry) return fail('No challenge for this account, request one first', 401);
  if (Date.now() >= entry.expiresAt) {
    challenges.delete(account);
    return fail('Challenge expired, request a new one', 401);
  }
  if (entry.nonce !== String(nonce)) return fail('Invalid challenge nonce', 401);
  challenges.delete(account); // single use
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

function verifySignature(accountKey, message, signature) {
  const sig = hexToBuffer(signature);
  if (!sig) return false;
  const keyObject = keyObjectFor(accountKey);
  if (!keyObject) return false;

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
  // The wallet signs the nonce exactly as the client received it.
  const message = Buffer.from(String(nonce), 'utf8');
  if (!verifySignature(key, message, signature)) {
    throw fail('Signature check failed', 401);
  }
}
