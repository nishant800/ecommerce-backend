import { SupportConversation, SupportQuota, SupportTicket } from './support.model.js';
import { commonAnswer } from './support.knowledge.js';
import { safeSupportContext, supportId } from './support.context.js';
import { providerAnswer } from './support.provider.js';
import { supportText } from './support.security.js';
import { CATEGORIES, SupportError, type SupportRole } from './support.types.js';
export async function ownedConversation(userId: string, role: SupportRole, id: string) {
    supportId(id, 'conversation ID');
    const conversation = await SupportConversation.findOne({ _id: id, userId, role });
    if (!conversation) throw new SupportError(404, 'Conversation not found.');
    return conversation;
}
async function claimProviderBudget(userId: string) {
    if (!process.env.AI_API_KEY) throw new SupportError(503, 'ECSLocal Help is temporarily unavailable.');
    const day = new Date().toISOString().slice(0, 10);
    const configured = Number(process.env.AI_SUPPORT_DAILY_LIMIT || 30);
    const limit = Number.isFinite(configured) ? Math.min(100, Math.max(1, Math.floor(configured))) : 30;
    // Unique daily bucket and guarded increment enforce a shared budget across server instances.
    try { await SupportQuota.updateOne({ userId, day }, { $setOnInsert: { calls: 0, expiresAt: new Date(Date.now() + 2 * 86400_000) } }, { upsert: true }); }
    catch (error: any) { if (error?.code !== 11000) throw error; }
    const claimed = await SupportQuota.findOneAndUpdate({ userId, day, calls: { $lt: limit } }, { $inc: { calls: 1 } });
    if (!claimed) throw new SupportError(429, 'AI help has reached your daily limit. Common help topics and Contact Support are still available.');
}
export async function chat(userId: string, role: SupportRole, body: any) {
    const message = supportText(body.message, 1500);
    let conversation = body.conversationId ? await ownedConversation(userId, role, supportId(body.conversationId, 'conversation ID')) : null;
    const boundOrder = conversation?.relatedOrderId ? String(conversation.relatedOrderId) : undefined;
    const requestedOrder = body.orderId === undefined ? undefined : supportId(body.orderId, 'order ID');
    if (conversation && requestedOrder !== undefined && requestedOrder !== boundOrder) throw new SupportError(400, 'Start a new conversation for a different order.');
    const orderId = boundOrder || requestedOrder;
    const context = await safeSupportContext(userId, role, orderId);
    let answer = commonAnswer(message, context);
    if (!answer) { await claimProviderBudget(userId); answer = await providerAnswer(message, context, conversation?.messages || []); }
    const now = new Date();
    const messages = [{ role: 'user' as const, content: message, createdAt: now }, { role: 'assistant' as const, content: answer.message, createdAt: now }];
    if (!conversation) conversation = await SupportConversation.create({ userId, role, relatedOrderId: orderId, messages });
    else await SupportConversation.updateOne({ _id: conversation._id, userId, role }, { $push: { messages: { $each: messages, $slice: -40 } } });
    const { availableActions } = await import('./support.actions.js');
    return { ...answer, actions: await availableActions({ userId, role }, orderId), conversationId: String(conversation._id) };
}
export const conversationView = (c: any) => ({ conversationId: String(c._id), orderId: c.relatedOrderId ? String(c.relatedOrderId) : undefined, status: c.status, messages: c.messages, updatedAt: c.updatedAt });
export const ticketView = (t: any, admin = false) => ({ ticketId: String(t._id), category: t.category, subject: t.subject, message: t.message, role: t.role, orderId: t.relatedOrderId ? String(t.relatedOrderId) : undefined, status: t.status, resolution: t.resolution, createdAt: t.createdAt, updatedAt: t.updatedAt, ...(admin ? { userId: String(t.userId) } : {}) });
export async function createTicket(userId: string, role: SupportRole, body: any) {
    const subject = supportText(body.subject, 120, 'Subject'); const message = supportText(body.message, 2000);
    if (!CATEGORIES.includes(body.category)) throw new SupportError(400, 'Invalid ticket category.');
    if (typeof body.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestKey)) throw new SupportError(400, 'A ticket request key is required.');
    const conversation = body.conversationId ? await ownedConversation(userId, role, supportId(body.conversationId, 'conversation ID')) : null;
    const boundOrder = conversation?.relatedOrderId ? String(conversation.relatedOrderId) : undefined;
    const requestedOrder = body.orderId === undefined ? undefined : supportId(body.orderId, 'order ID');
    if (conversation && requestedOrder !== undefined && requestedOrder !== boundOrder) throw new SupportError(400, 'Conversation order does not match.');
    const orderId = boundOrder || requestedOrder;
    await safeSupportContext(userId, role, orderId);
    let ticket;
    try { ticket = await SupportTicket.findOneAndUpdate({ userId, role, requestKey: body.requestKey }, { $setOnInsert: { category: body.category, subject, message, relatedOrderId: orderId, conversationId: conversation?._id, status: 'open' } }, { upsert: true, new: true, runValidators: true }); }
    catch (error: any) { if (error?.code !== 11000) throw error; ticket = await SupportTicket.findOne({ userId, role, requestKey: body.requestKey }); }
    if (!ticket) throw new SupportError(503, 'Unable to save ticket. Please retry.');
    if (conversation) await SupportConversation.updateOne({ _id: conversation._id, userId, role }, { $set: { status: 'escalated' } });
    return ticketView(ticket);
}
