import mongoose from 'mongoose';

export const DELIVERY_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  RESCHEDULED: 'rescheduled'
};

const addressSchema = new mongoose.Schema({
  label: { type: String, trim: true, maxlength: 100 },
  line1: { type: String, required: true, trim: true, maxlength: 160 },
  line2: { type: String, trim: true, maxlength: 160 },
  city: { type: String, required: true, trim: true, maxlength: 80 },
  state: { type: String, required: true, trim: true, maxlength: 80 },
  postalCode: { type: String, required: true, trim: true, maxlength: 12 },
  contactName: { type: String, trim: true, maxlength: 80 },
  contactPhone: { type: String, trim: true, maxlength: 24 }
}, { _id: false });

const historySchema = new mongoose.Schema({
  status: { type: String, enum: Object.values(DELIVERY_STATUS), required: true },
  note: { type: String, trim: true, maxlength: 500 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, default: Date.now }
}, { _id: false });

const liveLocationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracyMeters: { type: Number, min: 0, max: 10000 },
  speedKph: { type: Number, min: 0, max: 500 },
  headingDegrees: { type: Number, min: 0, max: 360 },
  sharing: { type: Boolean, default: true },
  updatedAt: { type: Date, required: true, default: Date.now }
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  trackingNumber: { type: String, required: true, unique: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pickupAddress: { type: addressSchema, required: true },
  deliveryAddress: { type: addressSchema, required: true },
  packageDescription: { type: String, required: true, trim: true, maxlength: 300 },
  packageWeightKg: { type: Number, required: true, min: 0.1 },
  priority: { type: String, enum: ['standard', 'express', 'urgent'], default: 'standard', index: true },
  expectedDeliveryAt: { type: Date, required: true, index: true },
  assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null, index: true },
  assignedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null, index: true },
  status: { type: String, enum: Object.values(DELIVERY_STATUS), default: DELIVERY_STATUS.PENDING, index: true },
  history: { type: [historySchema], default: [] },
  proof: {
    recipientName: String,
    otpHash: { type: String, select: false },
    deliveredAt: Date,
    driverNotes: String,
    imagePath: String,
    image: {
      provider: { type: String, enum: ['imagekit'] },
      fileId: String,
      filePath: String,
      originalName: String
    }
  },
  liveLocation: { type: liveLocationSchema, default: undefined },
  delayedNotifiedAt: Date
}, { timestamps: true, optimisticConcurrency: true });

deliverySchema.set('toJSON', {
  transform: (_document, result) => {
    if (result.proof) delete result.proof.otpHash;
    return result;
  }
});

deliverySchema.index({ customer: 1, createdAt: -1 });
deliverySchema.index({ status: 1, priority: 1, expectedDeliveryAt: 1 });
deliverySchema.index({ assignedDriver: 1, status: 1 });
deliverySchema.index({ packageDescription: 'text', trackingNumber: 'text' });

export const Delivery = mongoose.model('Delivery', deliverySchema);
