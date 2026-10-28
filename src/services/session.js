import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env.js';

const baseOptions = () => ({ httpOnly: true, secure: isProd, sameSite: env.cookieSameSite });

export function startSession(res, user, status = 200) {
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
  res.cookie('token', token, { ...baseOptions(), maxAge: env.cookieMaxAgeMs });
  res.status(status).json({ data: user, token });
}

export function clearSession(res) {
  res.clearCookie('token', baseOptions());
}
