import { proposeAction, executeAction, refreshAction } from './support.actions.js';
import { supportHandler } from './support.controller.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate, type AuthRequest } from '../../middleware/auth.middleware.js';
import { adminTickets, adminUpdateTicket, getConversation, getConversations, getTickets, postChat, postTicket } from './support.controller.js';
const router = Router();
const limited = { success: false, message: 'Too many support requests. Please try again shortly.', suggestedActions: ['contact_support'] };
router.use(rateLimit({ windowMs: 10 * 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: limited }));
router.use(authenticate);
router.use((req: AuthRequest, res, next) => {
    if (req.path.startsWith('/admin/')) {
        if (req.user?.role !== 'admin' || req.user.accountRole !== 'admin') return res.status(403).json({ success: false, message: 'Administrator access required.' });
    } else {
        if (!['customer', 'seller'].includes(req.user?.role || '') || (req.user?.role === 'seller' && req.user.accountRole !== 'seller')) return res.status(403).json({ success: false, message: 'Customer or seller session required.' });
        if (req.method === 'POST' && (!req.body || req.body.role !== req.user?.role)) return res.status(403).json({ success: false, message: 'Support role must match the authenticated session.' });
    }
    next();
});
const userKey = (req: AuthRequest) => req.user!.userId;
router.post('/chat', rateLimit({ windowMs: 10 * 60_000, limit: 20, keyGenerator: userKey, standardHeaders: 'draft-8', legacyHeaders: false, message: limited }), postChat);
router.post('/actions/propose', rateLimit({ windowMs: 10 * 60_000, limit: 30, keyGenerator: userKey, standardHeaders: 'draft-8', legacyHeaders: false, message: limited }), supportHandler(async (req, res) => { res.json({ success: true, data: await proposeAction({ userId: req.user!.userId, role: req.user!.role as 'customer' | 'seller' }, req.body) }); }));
router.post('/actions/execute', rateLimit({ windowMs: 10 * 60_000, limit: 10, keyGenerator: userKey, standardHeaders: 'draft-8', legacyHeaders: false, message: limited }), supportHandler(async (req, res) => { res.json({ success: true, data: await executeAction({ userId: req.user!.userId, role: req.user!.role as 'customer' | 'seller' }, req.body) }); }));
router.post('/actions/refresh', supportHandler(async (req, res) => { res.json({ success: true, data: await refreshAction({ userId: req.user!.userId, role: req.user!.role as 'customer' | 'seller' }, req.body) }); }));
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.post('/tickets', rateLimit({ windowMs: 60 * 60_000, limit: 6, keyGenerator: userKey, standardHeaders: 'draft-8', legacyHeaders: false, message: limited }), postTicket);
router.get('/tickets', getTickets);
router.get('/admin/tickets', adminTickets);
router.patch('/admin/tickets/:id', adminUpdateTicket);
export default router;
