import { Delivery } from '../models/delivery.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';
import { ok } from '../utils/api-response.js';

export async function overview(_req, res) {
  const now = new Date();
  const [statusCounts, delayed, availableDrivers, vehiclesInUse, completedByDay, driverWorkload] = await Promise.all([
    Delivery.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Delivery.countDocuments({ expectedDeliveryAt: { $lt: now }, status: { $nin: ['delivered', 'cancelled', 'failed'] } }),
    Driver.countDocuments({ isActive: true, status: 'available' }),
    Vehicle.countDocuments({ isActive: true, status: 'in_use' }),
    Delivery.aggregate([
      { $match: { status: 'delivered', 'proof.deliveredAt': { $gte: new Date(now.getTime() - 14 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$proof.deliveredAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }
    ]),
    Delivery.aggregate([
      { $match: { assignedDriver: { $ne: null }, status: { $nin: ['delivered', 'cancelled', 'failed'] } } },
      { $group: { _id: '$assignedDriver', activeDeliveries: { $sum: 1 } } },
      { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } }, { $unwind: '$driver' },
      { $lookup: { from: 'users', localField: 'driver.user', foreignField: '_id', as: 'user' } }, { $unwind: '$user' },
      { $project: { _id: 0, driverId: '$_id', name: '$user.name', activeDeliveries: 1 } }, { $sort: { activeDeliveries: -1 } }
    ])
  ]);
  const counts = Object.fromEntries(statusCounts.map(({ _id, count }) => [_id, count]));
  return ok(res, {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0), pending: counts.pending ?? 0,
    inTransit: (counts.picked_up ?? 0) + (counts.in_transit ?? 0), delivered: counts.delivered ?? 0,
    delayed, availableDrivers, vehiclesInUse,
    completedByDay: completedByDay.map((item) => ({ date: item._id, count: item.count })), driverWorkload
  });
}

