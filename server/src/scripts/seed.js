import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/user.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';
import { Delivery } from '../models/delivery.js';

await connectDatabase();
const passwordHash = await User.hashPassword('Demo1234');
const accounts = [
  ['Aarav Admin', 'admin@fleetflow.demo', 'admin'], ['Meera Manager', 'manager@fleetflow.demo', 'manager'],
  ['Rohan Driver', 'driver@fleetflow.demo', 'driver'], ['Kavya Customer', 'customer@fleetflow.demo', 'customer']
];
const users = {};
for (const [name, email, role] of accounts) users[role] = await User.findOneAndUpdate({ email }, { name, email, role, passwordHash, isActive: true }, { upsert: true, new: true });
const driver = await Driver.findOneAndUpdate({ user: users.driver._id }, { user: users.driver._id, licenseNumber: 'KA01-2026-DEMO', licenseExpiresAt: new Date('2028-12-31'), status: 'available', isActive: true }, { upsert: true, new: true });
const vehicle = await Vehicle.findOneAndUpdate({ registrationNumber: 'KA-01-FF-2401' }, { registrationNumber: 'KA-01-FF-2401', type: 'van', capacityKg: 850, status: 'available', isActive: true }, { upsert: true, new: true });
const address = { line1: '42 Demonstration Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' };
const demoDelivery = await Delivery.findOneAndUpdate({ trackingNumber: 'FF-DEMO-1001' }, { trackingNumber: 'FF-DEMO-1001', customer: users.customer._id, pickupAddress: address, deliveryAddress: { ...address, line1: '18 Portfolio Avenue' }, packageDescription: 'Synthetic demo: retail inventory cartons', packageWeightKg: 120, priority: 'express', expectedDeliveryAt: new Date(Date.now() + 86400000), assignedDriver: driver._id, assignedVehicle: vehicle._id, status: 'assigned', history: [{ status: 'pending', actor: users.customer._id, note: 'Synthetic demonstration delivery' }, { status: 'assigned', actor: users.manager._id, note: 'Demo assignment' }], proof: { otpHash: await bcrypt.hash('2468', 10) } }, { upsert: true, new: true });
await Promise.all([
  Driver.updateOne({ _id: driver._id }, { status: 'busy', currentDelivery: demoDelivery._id }),
  Vehicle.updateOne({ _id: vehicle._id }, { status: 'in_use', currentDelivery: demoDelivery._id })
]);
console.log('Seed complete. Demo password: Demo1234');
await disconnectDatabase();
