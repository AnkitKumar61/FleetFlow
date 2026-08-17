import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  phone: { type: String, trim: true, maxlength: 24, unique: true, sparse: true },
  phoneVerifiedAt: { type: Date, default: null },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'driver', 'customer'], default: 'customer', index: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = (password) => bcrypt.hash(password, 12);

userSchema.set('toJSON', {
  transform: (_doc, value) => {
    delete value.passwordHash;
    delete value.__v;
    return value;
  }
});

export const User = mongoose.model('User', userSchema);
