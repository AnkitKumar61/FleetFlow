import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { PhoneVerification } from '../models/phone-verification.js';
import { User } from '../models/user.js';
import { AppError } from '../utils/app-error.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const RESEND_WAIT_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const tokenHash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const codeHash = (value) => crypto.createHmac('sha256', env.ACCESS_TOKEN_SECRET).update(value).digest('hex');
const requestOwner = (requestedBy) => requestedBy ?? null;

export async function startPhoneVerification({ phone, purpose, requestedBy }) {
  if (await User.exists({ phone })) throw new AppError(409, 'PHONE_IN_USE', 'An account already uses this phone number');

  const recent = await PhoneVerification.findOne({
    phone,
    purpose,
    requestedBy: requestOwner(requestedBy),
    createdAt: { $gt: new Date(Date.now() - RESEND_WAIT_MS) }
  }).sort({ createdAt: -1 });
  if (recent) throw new AppError(429, 'PHONE_CODE_WAIT', 'Wait 30 seconds before requesting another code');

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const verification = await PhoneVerification.create({
    phone,
    purpose,
    requestedBy: requestOwner(requestedBy),
    codeHash: codeHash(code),
    expiresAt,
    deleteAt: expiresAt
  });

  return {
    verificationId: verification._id,
    phone,
    expiresInSeconds: CODE_TTL_MS / 1000,
    mode: env.PHONE_VERIFICATION_MODE,
    testCode: env.PHONE_VERIFICATION_MODE === 'test' ? code : undefined
  };
}

export async function verifyPhoneCode({ verificationId, phone, code, purpose, requestedBy }) {
  const verification = await PhoneVerification.findOne({
    _id: verificationId,
    phone,
    purpose,
    requestedBy: requestOwner(requestedBy),
    consumedAt: null
  });
  if (!verification || verification.verifiedAt) throw new AppError(409, 'PHONE_VERIFICATION_INVALID', 'Request a new phone verification code');
  if (verification.expiresAt <= new Date()) throw new AppError(410, 'PHONE_CODE_EXPIRED', 'The verification code expired. Request a new code');
  if (verification.attempts >= MAX_ATTEMPTS) throw new AppError(429, 'PHONE_CODE_LOCKED', 'Too many incorrect attempts. Request a new code');

  const expected = Buffer.from(verification.codeHash, 'hex');
  const received = Buffer.from(codeHash(code), 'hex');
  if (!crypto.timingSafeEqual(expected, received)) {
    verification.attempts += 1;
    await verification.save();
    throw new AppError(422, 'INVALID_PHONE_CODE', verification.attempts >= MAX_ATTEMPTS ? 'Too many incorrect attempts. Request a new code' : 'The verification code is incorrect');
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  verification.verifiedAt = now;
  verification.tokenHash = tokenHash(verificationToken);
  verification.tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
  verification.deleteAt = verification.tokenExpiresAt;
  await verification.save();
  return { phone, verificationToken, verifiedAt: verification.verifiedAt };
}

export async function consumePhoneVerification({ phone, verificationToken, purpose, requestedBy, session }) {
  const verification = await PhoneVerification.findOneAndUpdate({
    phone,
    purpose,
    requestedBy: requestOwner(requestedBy),
    tokenHash: tokenHash(verificationToken),
    verifiedAt: { $ne: null },
    tokenExpiresAt: { $gt: new Date() },
    consumedAt: null
  }, { $set: { consumedAt: new Date() } }, { new: true, session });
  if (!verification) throw new AppError(422, 'PHONE_VERIFICATION_REQUIRED', 'Verify this phone number again before creating the account');
  return verification;
}
