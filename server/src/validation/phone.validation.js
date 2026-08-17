import { z } from 'zod';

export const phoneSchema = z.string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use an international phone number such as +919876543210'));

export const verificationIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const verificationCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification code');
export const verificationTokenSchema = z.string().regex(/^[a-f\d]{64}$/i, 'Phone verification is required');

export const startPhoneVerificationBody = z.object({ phone: phoneSchema });
export const verifyPhoneCodeBody = z.object({
  verificationId: verificationIdSchema,
  phone: phoneSchema,
  code: verificationCodeSchema
});
