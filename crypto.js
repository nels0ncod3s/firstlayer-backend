// crypto.js
import crypto from 'node:crypto';

// Generate a new key like: fl_live_8f3a9b...
export function generateApiKey(prefix = 'fl_live_') {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const rawKey = `${prefix}${randomBytes}`;
  return rawKey;
}

// Hash key using SHA-256 before saving/looking up in Supabase
export function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

const SCRYPT_KEYLEN = 64;

// Hash an end-user password with a random salt. Stored as "salt:hash" hex
// in project_users.password_hash — scrypt is built into Node, so this
// needs no extra dependency (and no native build step, unlike bcrypt).
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

// Compare a plaintext password against a "salt:hash" value from hashPassword().
export function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;

  const hashBuffer = Buffer.from(hash, 'hex');
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);

  if (candidate.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(candidate, hashBuffer);
}