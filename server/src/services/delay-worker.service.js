import { Delivery } from '../models/delivery.js';
import { Notification } from '../models/notification.js';
import { emitManagerAlert } from './realtime.service.js';

export async function processDelayCheck(deliveryId) {
  const delivery = await Delivery.findOne({
    _id: deliveryId,
    expectedDeliveryAt: { $lte: new Date() },
    status: { $nin: ['delivered', 'cancelled', 'failed'] }
  });
  if (!delivery) return null;

  const key = `delivery-delayed:${delivery._id}`;
  const notification = await Notification.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, audienceRole: 'manager', type: 'delivery_delayed', delivery: delivery._id, message: `${delivery.trackingNumber} is past its expected delivery time.` } },
    { new: true, upsert: true }
  );
  if (!delivery.delayedNotifiedAt) {
    delivery.delayedNotifiedAt = new Date();
    await delivery.save();
  }
  emitManagerAlert(notification);
  return notification;
}

