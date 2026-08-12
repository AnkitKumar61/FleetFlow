import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  licenseNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  licenseExpiresAt: { type: Date, required: true },
  status: { type: String, enum: ['available', 'busy', 'offline'], default: 'offline', index: true },
  currentDelivery: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', default: null },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

driverSchema.index({ isActive: 1, status: 1 });

export const Driver = mongoose.model('Driver', driverSchema);

