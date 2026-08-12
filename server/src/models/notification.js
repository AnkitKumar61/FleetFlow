import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  audienceRole: { type: String, enum: ['admin', 'manager'], required: true },
  type: { type: String, enum: ['delivery_delayed'], required: true },
  delivery: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true },
  message: { type: String, required: true },
  readAt: Date
}, { timestamps: true });

export const Notification = mongoose.model('Notification', notificationSchema);

