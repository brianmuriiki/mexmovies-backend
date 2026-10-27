import crypto from 'crypto';

// One-time tokens: the plain token goes in the email link, only its hash is stored.
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}
