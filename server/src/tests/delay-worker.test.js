import { describe, expect, it } from 'vitest';
import { User } from '../models/user.js';
import { Delivery } from '../models/delivery.js';
import { Notification } from '../models/notification.js';
import { processDelayCheck } from '../services/delay-worker.service.js';
describe('delayed delivery job',()=>{it('is idempotent across retries',async()=>{const user=await User.create({name:'Customer',email:'delay@example.com',passwordHash:'unused'});const address={line1:'1 Road',city:'Pune',state:'MH',postalCode:'411001'};const delivery=await Delivery.create({trackingNumber:'FF-DELAY',customer:user._id,pickupAddress:address,deliveryAddress:address,packageDescription:'Delayed',packageWeightKg:2,expectedDeliveryAt:new Date(Date.now()-1000),history:[{status:'pending',actor:user._id}]});await processDelayCheck(delivery._id);await processDelayCheck(delivery._id);expect(await Notification.countDocuments()).toBe(1);});});

