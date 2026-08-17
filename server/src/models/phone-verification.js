import mongoose from 'mongoose';

const phoneVerificationSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  purpose: { type: String, enum: ['customer_registration', 'staff_creation'], required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true },
  verifiedAt: { type: Date, default: null },
  tokenHash: { type: String, default: null },
  tokenExpiresAt: { type: Date, default: null },
  consumedAt: { type: Date, default: null },
  deleteAt: { type: Date, required: true }
}, { timestamps: true });

phoneVerificationSchema.index({ phone: 1, purpose: 1, requestedBy: 1, createdAt: -1 });
phoneVerificationSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

export const PhoneVerification = mongoose.model('PhoneVerification', phoneVerificationSchema);
