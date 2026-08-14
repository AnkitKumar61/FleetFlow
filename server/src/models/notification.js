import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  audienceRole: { type: String, enum: ['admin'] },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { type: String, enum: ['delivery_delayed', 'delivery_rejected', 'delivery_reassigned'], required: true },
  delivery: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true },
  message: { type: String, required: true },
  readAt: Date
}, { timestamps: true });

notificationSchema.pre('validate', function validateAudience(next) {
  if (Boolean(this.audienceRole) === Boolean(this.recipient)) {
    this.invalidate('recipient', 'A notification must target either one recipient or one audience role');
  }
  next();
});

export const Notification = mongoose.model('Notification', notificationSchema);
