import * as verificationService from '../services/phone-verification.service.js';
import { ok } from '../utils/api-response.js';

export async function startCustomer(req, res) {
  return ok(res, await verificationService.startPhoneVerification({ phone: req.body.phone, purpose: 'customer_registration' }), null, 201);
}

export async function verifyCustomer(req, res) {
  return ok(res, await verificationService.verifyPhoneCode({ ...req.body, purpose: 'customer_registration' }));
}

export async function startStaff(req, res) {
  return ok(res, await verificationService.startPhoneVerification({ phone: req.body.phone, purpose: 'staff_creation', requestedBy: req.user._id }), null, 201);
}

export async function verifyStaff(req, res) {
  return ok(res, await verificationService.verifyPhoneCode({ ...req.body, purpose: 'staff_creation', requestedBy: req.user._id }));
}
