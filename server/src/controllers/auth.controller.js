import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';
import { ok } from '../utils/api-response.js';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'strict',
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_DAYS * 86400000
});
const context = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip });

export async function register(req, res) {
  const result = await authService.register(req.body, context(req));
  res.cookie('refreshToken', result.refreshToken, cookieOptions());
  return ok(res, { user: result.user, accessToken: result.accessToken }, null, 201);
}
export async function login(req, res) {
  const result = await authService.login(req.body, context(req));
  res.cookie('refreshToken', result.refreshToken, cookieOptions());
  return ok(res, { user: result.user, accessToken: result.accessToken });
}
export async function refresh(req, res) {
  const result = await authService.rotateRefreshToken(req.cookies.refreshToken, context(req));
  res.cookie('refreshToken', result.refreshToken, cookieOptions());
  return ok(res, { user: result.user, accessToken: result.accessToken });
}
export async function logout(req, res) {
  await authService.logout(req.cookies.refreshToken);
  res.clearCookie('refreshToken', cookieOptions());
  return ok(res, { message: 'Signed out successfully' });
}
export async function me(req, res) { return ok(res, { user: req.user }); }
