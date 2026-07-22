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