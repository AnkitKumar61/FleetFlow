import crypto from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.js';
import { Session } from '../models/session.js';
import { AppError } from '../utils/app-error.js';
import { consumePhoneVerification } from './phone-verification.service.js';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function accessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.ACCESS_TOKEN_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });
}

function refreshToken(user, sessionId) {
  return jwt.sign({ sub: user._id.toString(), sid: sessionId.toString() }, env.REFRESH_TOKEN_SECRET, { expiresIn: `${env.REFRESH_TOKEN_DAYS}d` });
}

async function createSession(user, context) {
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000);
  const provisional = crypto.randomBytes(32).toString('hex');
  const session = await Session.create({ user: user._id, tokenHash: hash(provisional), expiresAt, ...context });
  const token = refreshToken(user, session._id);
  session.tokenHash = hash(token);
  await session.save();
  return token;
}

export async function register(input, context) {
  const email = input.email.toLowerCase();
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      if (await User.exists({ email }).session(session)) throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email');
      await consumePhoneVerification({ phone: input.phone, verificationToken: input.phoneVerificationToken, purpose: 'customer_registration', session });
      [user] = await User.create([{
        name: input.name,
        email,
        phone: input.phone,
        phoneVerifiedAt: new Date(),
        role: 'customer',
        passwordHash: await User.hashPassword(input.password)
      }], { session });
    });
  } finally {
    await session.endSession();
  }
  const refresh = await createSession(user, context);
  return { user, accessToken: accessToken(user), refreshToken: refresh };
}

export async function login(input, context) {
  const user = await User.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
  if (!user || !user.isActive || !(await user.verifyPassword(input.password))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  const refresh = await createSession(user, context);
  return { user, accessToken: accessToken(user), refreshToken: refresh };
}

export async function rotateRefreshToken(token, context) {
  if (!token) throw new AppError(401, 'REFRESH_REQUIRED', 'Refresh session is missing');
  let payload;
  try { payload = jwt.verify(token, env.REFRESH_TOKEN_SECRET); }
  catch { throw new AppError(401, 'INVALID_REFRESH', 'Refresh session is invalid or expired'); }

  const session = await Session.findOne({ _id: payload.sid, user: payload.sub, tokenHash: hash(token), revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError(401, 'REVOKED_REFRESH', 'Refresh session has been revoked');
  const user = await User.findById(payload.sub);
  if (!user?.isActive) throw new AppError(401, 'INACTIVE_ACCOUNT', 'This account is inactive');

  session.revokedAt = new Date();
  await session.save();
  const refresh = await createSession(user, context);
  return { user, accessToken: accessToken(user), refreshToken: refresh };
}

export async function logout(token) {
  if (!token) return;
  await Session.findOneAndUpdate({ tokenHash: hash(token) }, { revokedAt: new Date() });
}

