import * as deliveryService from '../services/delivery.service.js';
import { ok } from '../utils/api-response.js';

export async function create(req, res) { return ok(res, await deliveryService.createDelivery(req.body, req.user, req.id), null, 201); }
export async function list(req, res) {
  const result = await deliveryService.listDeliveries(req.query, req.user);
  return ok(res, result.items, { nextCursor: result.nextCursor });
}
export async function get(req, res) { return ok(res, await deliveryService.getAuthorizedDelivery(req.params.id, req.user, { populate: true })); }
export async function assign(req, res) { return ok(res, await deliveryService.assignDelivery(req.params.id, req.body, req.user, req.id)); }
export async function rejectAssignment(req, res) { return ok(res, await deliveryService.rejectAssignment(req.params.id, req.body, req.user, req.id)); }
export async function transition(req, res) { return ok(res, await deliveryService.transitionDelivery(req.params.id, req.body, req.user, req.id)); }
export async function updateLocation(req, res) { return ok(res, await deliveryService.updateLiveLocation(req.params.id, req.body, req.user)); }
export async function proof(req, res) { return ok(res, await deliveryService.submitProof(req.params.id, { ...req.body, imagePath: req.file?.path }, req.user, req.id)); }
