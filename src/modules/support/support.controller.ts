import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth.middleware.js';
import { SupportConversation, SupportTicket } from './support.model.js';
import { chat, conversationView, ownedConversation, createTicket, ticketView } from './support.service.js';
import { supportId } from './support.context.js';
import { supportText } from './support.security.js';
import { SupportError, type SupportRole } from './support.types.js';
export const supportHandler = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
    try { await handler(req, res); } catch (error) {
        const known = error instanceof SupportError;
        res.status(known ? error.statusCode : 503).json({ success: false, message: known ? error.message : 'ECSLocal Help is temporarily unavailable.', suggestedActions: ['contact_support'] });
    }
};
export const postChat = supportHandler(async (req, res) => { res.json({ success: true, data: await chat(req.user!.userId, req.user!.role as SupportRole, req.body) }); });
export const getConversations = supportHandler(async (req, res) => {
    const rows = await SupportConversation.find({ userId: req.user!.userId, role: req.user!.role }).select('relatedOrderId status updatedAt').sort({ updatedAt: -1 }).limit(20).lean();
    res.json({ success: true, data: rows.map(conversationView) });
});
export const getConversation = supportHandler(async (req, res) => { res.json({ success: true, data: conversationView(await ownedConversation(req.user!.userId, req.user!.role as SupportRole, String(req.params.id))) }); });
export const postTicket = supportHandler(async (req, res) => { res.status(201).json({ success: true, data: await createTicket(req.user!.userId, req.user!.role as SupportRole, req.body) }); });
export const getTickets = supportHandler(async (req, res) => { res.json({ success: true, data: (await SupportTicket.find({ userId: req.user!.userId, role: req.user!.role }).sort({ createdAt: -1 }).limit(30).lean()).map(t => ticketView(t)) }); });
export const adminTickets = supportHandler(async (req, res) => {
    if (req.query.status !== undefined && !['open', 'in_progress', 'resolved'].includes(String(req.query.status))) throw new SupportError(400, 'Invalid ticket status.');
    const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
    const rows = await SupportTicket.find(req.query.status ? { status: req.query.status } : {}).sort({ createdAt: -1 }).skip((Math.floor(page) - 1) * 30).limit(30).lean();
    res.json({ success: true, data: rows.map(t => ticketView(t, true)) });
});
export const adminUpdateTicket = supportHandler(async (req, res) => {
    if (!['open', 'in_progress', 'resolved'].includes(req.body.status)) throw new SupportError(400, 'Invalid ticket status.');
    const resolution = req.body.resolution ? supportText(req.body.resolution, 2000, 'Resolution') : undefined;
    if (req.body.status === 'resolved' && !resolution) throw new SupportError(400, 'A resolution is required.');
    const ticket = await SupportTicket.findByIdAndUpdate(supportId(String(req.params.id), 'ticket ID'), { $set: { status: req.body.status, resolution: resolution || '', resolvedAt: req.body.status === 'resolved' ? new Date() : null } }, { new: true, runValidators: true });
    if (!ticket) throw new SupportError(404, 'Ticket not found.');
    res.json({ success: true, data: ticketView(ticket, true) });
});
