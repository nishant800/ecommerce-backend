import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth.middleware.js';
import { sellerOnly } from '../../middleware/seller.middleware.js';
import { PickupService } from './pickup.service.js';
const endpoint = (handler: (req: AuthRequest) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
    try { return res.json({ success: true, data: await handler(req), serverNow: new Date().toISOString() }); }
    catch (error: any) { return res.status(400).json({ success: false, message: error.message, serverNow: new Date().toISOString() }); }
};
export const customerPickupRoutes = Router();
// Public product information only; all subsequent pickup routes require authentication.
customerPickupRoutes.get('/pickup/availability/:productId', endpoint(req => PickupService.availability(String(req.params.productId))));
customerPickupRoutes.use(authenticate);
customerPickupRoutes.get('/:id/pickup', endpoint(req => PickupService.detail(String(req.params.id), req.user!.userId)));
customerPickupRoutes.post('/:id/pickup/cancel', endpoint(async req => {
    await PickupService.expireFor({ _id: req.params.id, user: req.user!.userId });
    await PickupService.release(String(req.params.id), 'cancelled', req.user!.userId);
    return PickupService.detail(String(req.params.id), req.user!.userId);
}));
customerPickupRoutes.post('/:id/pickup/payment', endpoint(req => PickupService.createPayment(String(req.params.id), req.user!.userId)));
export const sellerPickupRoutes = Router();
sellerPickupRoutes.use(authenticate, sellerOnly);
sellerPickupRoutes.post('/pickup/validate', endpoint(req => PickupService.validate(req.body.reference, req.user!.userId)));
sellerPickupRoutes.get('/orders/:id/pickup', endpoint(req => PickupService.detail(String(req.params.id), req.user!.userId, true)));
for (const [path, action] of [['ready', 'ready'], ['cash-received', 'cash'], ['complete', 'complete']] as const) {
    sellerPickupRoutes.post(`/orders/:id/pickup/${path}`, endpoint(req => PickupService.sellerAction(String(req.params.id), req.user!.userId, action)));
}
