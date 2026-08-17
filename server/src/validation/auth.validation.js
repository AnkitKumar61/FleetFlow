import { z } from 'zod';
import { phoneSchema, verificationTokenSchema } from './phone.validation.js';

export const registerBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  phone: phoneSchema,
  phoneVerificationToken: verificationTokenSchema,
  password: z.string().min(8).max(128).regex(/[A-Z]/, 'Include an uppercase letter').regex(/[0-9]/, 'Include a number')
});

export const loginBody = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });

