import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  registrationNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ['bike', 'van', 'truck'], required: true },
  capacityKg: { type: Number, required: true, min: 0.1 },
  status: { type: String, enum: ['available', 'in_use', 'maintenance'], default: 'available', index: true },
  currentDelivery: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', default: null },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

vehicleSchema.index({ isActive: 1, status: 1, capacityKg: 1 });

export const Vehicle = mongoose.model('Vehicle', vehicleSchema);

