import crypto from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
import Order from '../orders/order.model.js';
import Product from '../products/product.model.js';
import { onlineMethods, retryDeadline } from '../orders/payment-retry.js';
import { canProcessDelivery, isDeliveryPlaced } from '../orders/delivery-lifecycle.js';
import { safeSupportContext, supportId } from './support.context.js';
import { SupportError, type SupportRole, CATEGORIES } from './support.types.js';
import { supportText } from './support.security.js';
import { createTicket } from './support.service.js';

const proposalSchema = new Schema({
    tokenHash: { type: String, required: true, unique: true }, userId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, required: true }, action: { type: String, required: true }, resourceId: String,
    payload: Schema.Types.Mixed, expiresAt: { type: Date, required: true },
    state: { type: String, enum: ['proposed', 'executing', 'succeeded', 'failed'], default: 'proposed' },
}, { timestamps: true });
proposalSchema.index({ expiresAt: 1 });
export const SupportActionProposal = mongoose.model('SupportActionProposal', proposalSchema);
export const SupportActionAudit = mongoose.model('SupportActionAudit', new Schema({
    proposalId: Schema.Types.ObjectId, userId: Schema.Types.ObjectId, role: String, action: String,
    resourceId: String, result: String, source: { type: String, default: 'ai_support' },
}, { timestamps: true }));
type Actor = { userId: string; role: SupportRole };
type Definition = { roles: SupportRole[]; requiresConfirmation: boolean; resourceType: 'order' | 'product' | 'none'; label: string; auditEvent: string; eligibility: (a: Actor, id?: string) => Promise<any>; executor: (a: Actor, id: string | undefined, payload: any) => Promise<any> };
const fail = (message: string): never => { throw new SupportError(409, message); };
async function ownedOrder(a: Actor, id?: string) {
    supportId(id, 'order ID');
    await safeSupportContext(a.userId, a.role, id);
    const order = await Order.findOne({ _id: id, ...(a.role === 'customer' ? { user: a.userId } : { 'items.seller': a.userId }) });
    if (!order) throw new SupportError(404, 'Order not found.');
    return order;
}
async function product(a: Actor, id?: string) {
    supportId(id, 'product ID');
    const row = await Product.findOne({ _id: id, ...(a.role === 'seller' ? { seller: a.userId } : { active: true }) });
    if (!row) throw new SupportError(404, 'Product not found.');
    return row;
}
function activePickup(o: any) {
    if (o.fulfillmentType !== 'pickup' || !['reserved', 'ready'].includes(o.pickup?.status) || !o.pickup?.expiresAt || o.pickup.expiresAt <= new Date()) fail('This pickup reservation is no longer active.');
}
async function eligible(a: Actor, type: string, id?: string): Promise<any> {
    if (type === 'OPEN_PRODUCT' || type === 'OPEN_CHECKOUT') {
        if (!id && type === 'OPEN_CHECKOUT') return null;
        const p = await product(a, id);
        if (type === 'OPEN_CHECKOUT' && p.stock <= 0) fail('This product is out of stock.');
        return p;
    }
    if (['OPEN_ADDRESS_SETTINGS', 'OPEN_DELIVERY', 'OPEN_DELIVERY_SCANNER', 'OPEN_PICKUP_SETTINGS', 'CREATE_SUPPORT_TICKET'].includes(type)) return id ? ownedOrder(a, id) : null;
    if (type === 'OPEN_STORE_PICKUP' && !id) return null;
    const o = await ownedOrder(a, id);
    if (['CANCEL_PICKUP_RESERVATION', 'PAY_PICKUP_ONLINE', 'MARK_PICKUP_READY'].includes(type)) {
        activePickup(o);
        if (type === 'MARK_PICKUP_READY' && (String(o.pickup?.sellerId) !== a.userId || o.pickup?.status !== 'reserved')) fail('This reservation cannot be marked ready.');
        if (type === 'PAY_PICKUP_ONLINE' && (o.paymentMethod !== 'pay_at_store' || o.paymentStatus !== 'pending' || o.total <= 0)) fail('Online payment is unavailable for this reservation.');
    }
    if (type === 'CANCEL_ORDER') {
        if (o.fulfillmentType === 'pickup') fail('Use Cancel Pickup Reservation for this order.');
        if (!['pending', 'processing', 'partially_cancelled'].includes(o.orderStatus)) fail('This order has already been shipped or closed and can no longer be cancelled.');
        if (!o.items.some(i => i.quantity > (i.cancelledQuantity || 0))) fail('No active items remain.');
        if (o.items.some(i => i.quantity > (i.cancelledQuantity || 0) && ['shipped', 'out_for_delivery', 'delivered'].includes(i.fulfilmentStatus || ''))) fail('This order has shipped items and can no longer be cancelled in full.');
    }
    if (type === 'RETRY_PAYMENT') {
        const pickup = o.fulfillmentType === 'pickup';
        if (pickup) activePickup(o);
        if (!['pending', 'failed'].includes(o.paymentStatus) || !onlineMethods.test(o.paymentMethod) || o.total <= 0 || (!pickup && (!o.paymentRetryEnabled || o.sellerReleasedAt || !['pending', 'partially_cancelled'].includes(o.orderStatus) || retryDeadline(o).getTime() <= Date.now()))) fail('This payment is no longer retryable.');
        if (o.paymentCreationLockUntil && o.paymentCreationLockUntil > new Date()) fail('Payment is already being prepared.');
    }
    if (type === 'GENERATE_SHIPPING_LABEL') {
        const items = o.items.filter(i => String(i.seller) === a.userId && i.quantity > (i.cancelledQuantity || 0));
        if (!canProcessDelivery(o) || !items.length || !items.every(i => i.fulfilmentStatus === 'processing' || isDeliveryPlaced(i.fulfilmentStatus || o.orderStatus))) fail('This order is not eligible for a shipping label.');
    }
    if (type === 'OPEN_DELIVERY_TRACKING' && o.fulfillmentType === 'pickup') fail('This is a Store Pickup order.');
    if (type === 'OPEN_STORE_PICKUP' && o.fulfillmentType !== 'pickup') fail('This is a Home Delivery order.');
    if (type === 'RESERVE_PICKUP_AGAIN') {
        if (o.fulfillmentType !== 'pickup' || !['expired', 'cancelled'].includes(o.pickup?.status || '')) fail('Only expired or cancelled pickup reservations can be reserved again.');
        if (o.items.length !== 1) fail('Open the products to build a new pickup cart.');
        const item = o.items[0]; const p = await product(a, String(item.product));
        if (p.stock < item.quantity || String(p.seller) !== String(o.pickup?.sellerId)) fail('The original quantity or seller is no longer available.');
        const v = item.variant?.sku ? p.variants.find(v => v.sku === item.variant!.sku) : undefined;
        if (item.variant?.sku && (!v || v.stock < item.quantity)) fail('The original product variant is unavailable.');
        const key = ({ size: 'sizes', shade: 'shades', color: 'colors' } as Record<string, string>)[item.variant?.optionType || ''];
        if (key && item.variant?.optionValue && !(v as any)?.[key]?.some((x: any) => String(x[item.variant!.optionType!]).toLowerCase() === item.variant!.optionValue!.toLowerCase() && x.stock >= item.quantity)) fail('The original product option is unavailable.');
        const { PickupService } = await import('../orders/pickup.service.js');
        try { await PickupService.eligibleSeller(p.seller); } catch (error) {
            const message = error instanceof Error ? error.message : '';
            fail(/^(Store |Seller does not|Pickup seller)/.test(message) ? message : 'Store Pickup is currently unavailable. Check the store address and opening hours.');
        }
        return { order: o, productId: String(p._id) };
    }
    return o;
}
const customer: SupportRole[] = ['customer']; const seller: SupportRole[] = ['seller']; const both: SupportRole[] = ['customer', 'seller'];
const specifications: [string, SupportRole[], boolean, Definition['resourceType'], string][] = [
    ['OPEN_ORDER', both, false, 'order', 'View Order'], ['OPEN_PRODUCT', both, false, 'product', 'View Product'],
    ['OPEN_CHECKOUT', customer, false, 'product', 'Open Checkout'], ['OPEN_STORE_PICKUP', both, false, 'order', 'Open Store Pickup'],
    ['OPEN_DELIVERY_TRACKING', customer, false, 'order', 'Track Delivery'], ['OPEN_ADDRESS_SETTINGS', customer, false, 'none', 'Address Settings'],
    ['CANCEL_ORDER', customer, true, 'order', 'Cancel Order'], ['CANCEL_PICKUP_RESERVATION', customer, true, 'order', 'Cancel Reservation'],
    ['RESERVE_PICKUP_AGAIN', customer, true, 'order', 'Reserve Again'], ['PAY_PICKUP_ONLINE', customer, true, 'order', 'Pay Online Now'],
    ['RETRY_PAYMENT', customer, true, 'order', 'Retry Payment'], ['CREATE_SUPPORT_TICKET', both, true, 'none', 'Create Support Ticket'],
    ['OPEN_DELIVERY', seller, false, 'none', 'Open Delivery'], ['OPEN_PICKUP_SETTINGS', seller, false, 'none', 'Pickup Settings'],
    ['GENERATE_SHIPPING_LABEL', seller, true, 'order', 'Generate Shipping Label'], ['OPEN_DELIVERY_SCANNER', seller, false, 'none', 'Open Delivery Scanner'],
    ['MARK_PICKUP_READY', seller, true, 'order', 'Mark Ready for Pickup'],
];
async function executeBusiness(a: Actor, type: string, id: string | undefined, payload: any) {
    if (type === 'CANCEL_ORDER') { const { OrderService } = await import('../orders/order.service.js'); await OrderService.cancelOrder(a.userId, id!); return { message: 'Order cancelled.' }; }
    if (type === 'CANCEL_PICKUP_RESERVATION') { const { PickupService } = await import('../orders/pickup.service.js'); await PickupService.release(id!, 'cancelled', a.userId); return { message: 'Pickup reservation cancelled.' }; }
    if (type === 'MARK_PICKUP_READY') { const { PickupService } = await import('../orders/pickup.service.js'); await PickupService.sellerAction(id!, a.userId, 'ready'); return { message: 'Order is ready for pickup.' }; }
    if (type === 'CREATE_SUPPORT_TICKET') { const ticket = await createTicket(a.userId, a.role, { ...payload, orderId: id }); return { message: 'Support ticket created.', ticket }; }
    if (type === 'RESERVE_PICKUP_AGAIN') { const data = await eligible(a, type, id); return { message: 'Continue in the product flow to choose Store Pickup and confirm a new reservation.', workflow: { type: 'OPEN_PRODUCT', resourceId: data.productId } }; }
    return { message: ['GENERATE_SHIPPING_LABEL', 'PAY_PICKUP_ONLINE', 'RETRY_PAYMENT'].includes(type) ? 'Continue in the existing workflow. Completion will be confirmed by the backend.' : 'Open the selected screen.', workflow: { type, resourceId: id } };
}
export const SUPPORT_ACTIONS: Record<string, Definition> = Object.fromEntries(specifications.map(([type, roles, requiresConfirmation, resourceType, label]) => [type, {
    roles, requiresConfirmation, resourceType, label, auditEvent: type,
    eligibility: (a: Actor, id?: string) => eligible(a, type, id),
    executor: (a: Actor, id: string | undefined, payload: any) => executeBusiness(a, type, id, payload),
}]));
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const audit = (p: any, result: string) => SupportActionAudit.create({ proposalId: p._id, userId: p.userId, role: p.role, action: p.action, resourceId: p.resourceId, result, source: 'ai_support' });
function definition(a: Actor, type: unknown) {
    if (typeof type !== 'string' || !Object.hasOwn(SUPPORT_ACTIONS, type)) throw new SupportError(400, 'Unknown support action.');
    const d = SUPPORT_ACTIONS[type]; if (!d.roles.includes(a.role)) throw new SupportError(403, 'This action is unavailable for this role.'); return d;
}
export async function proposeAction(a: Actor, body: any) {
    const d = definition(a, body.type); const id = body.resourceId === undefined ? undefined : supportId(body.resourceId, 'resource ID');
    const value = await d.eligibility(a, id);
    const payload = body.type === 'CREATE_SUPPORT_TICKET' ? {
        category: body.category || 'other', subject: supportText(body.subject, 120, 'Subject'), message: supportText(body.message, 2000), requestKey: 'action_' + crypto.randomBytes(24).toString('hex'),
    } : undefined;
    if (payload && !CATEGORIES.includes(payload.category)) throw new SupportError(400, 'Invalid ticket category.');
    const o = value?.order || (value?.items ? value : null);
    const token = crypto.randomBytes(32).toString('hex'); const expiresAt = new Date(Date.now() + 5 * 60_000);
    const p = await SupportActionProposal.create({ tokenHash: hash(token), userId: a.userId, role: a.role, action: body.type, resourceId: id, payload, expiresAt });
    await audit(p, 'proposed');
    return { allowed: true, type: body.type, requiresConfirmation: d.requiresConfirmation, actionToken: token, expiresAt, confirmation: {
        title: d.label + (d.requiresConfirmation ? '?' : ''), description: o ? 'Order #' + String(o._id).slice(-6).toUpperCase() : payload ? payload.subject : d.label,
        details: payload ? [payload.category, payload.message] : o ? ['Amount: ₹' + o.total, 'Current status: ' + (o.pickup?.status || o.orderStatus), ...(o.pickup?.expiresAt ? ['Pickup expires: ' + o.pickup.expiresAt.toISOString()] : [])] : [],
        warnings: body.type.startsWith('CANCEL') ? ['Reserved stock will be released.', ...(o?.paymentStatus === 'success' && o.total > 0 ? ['Paid orders use the existing refund process. Refund completion is subject to gateway confirmation.'] : [])] : body.type === 'RESERVE_PICKUP_AGAIN' ? ['A new reservation must be confirmed at checkout. The old order and QR will not be revived.'] : body.type === 'GENERATE_SHIPPING_LABEL' ? ['Only successful label generation can move the order to Shipped.'] : [],
        destructive: body.type.startsWith('CANCEL'), confirmLabel: d.label,
    } };
}
async function proposal(a: Actor, token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new SupportError(400, 'Invalid action token.');
    const p = await SupportActionProposal.findOne({ tokenHash: hash(token), userId: a.userId, role: a.role });
    if (!p) throw new SupportError(404, 'Action proposal not found.');
    return p;
}
export async function executeAction(a: Actor, body: any) {
    const p = await proposal(a, body.actionToken);
    if (p.expiresAt <= new Date()) throw new SupportError(410, 'This action proposal expired. Request a new proposal.');
    const d = definition(a, p.action);
    if (d.requiresConfirmation && body.confirmed !== true) throw new SupportError(400, 'Confirm this action before continuing.');
    const claimed = await SupportActionProposal.findOneAndUpdate({ _id: p._id, state: 'proposed', expiresAt: { $gt: new Date() } }, { $set: { state: 'executing' } }, { new: true });
    if (!claimed) throw new SupportError(409, 'This action has already been used or is in progress.');
    await audit(p, 'execution_started');
    try {
        await d.eligibility(a, p.resourceId || undefined);
        const result = await d.executor(a, p.resourceId || undefined, p.payload);
        await SupportActionProposal.updateOne({ _id: p._id }, { $set: { state: 'succeeded' } });
        await audit(p, result.workflow ? 'workflow_opened' : 'succeeded');
        return { ...result, context: p.resourceId && (d.resourceType === 'order' || p.action === 'CREATE_SUPPORT_TICKET') ? await safeSupportContext(a.userId, a.role, p.resourceId) : undefined };
    } catch (error) {
        await SupportActionProposal.updateOne({ _id: p._id }, { $set: { state: 'failed' } }); await audit(p, 'failed');
        if (error instanceof SupportError) throw error;
        const safe = error instanceof Error ? error.message : '';
        const known = /^(Pickup |Order can only|Order is already|There are no active|Seller does not|Store Pickup)/.test(safe);
        throw new SupportError(409, known ? safe : 'The action could not complete. Refresh and request a new proposal.');
    }
}
export async function refreshAction(a: Actor, body: any) {
    const p = await proposal(a, body.actionToken);
    if (p.state !== 'succeeded') throw new SupportError(409, 'This action has not completed.');
    const d = definition(a, p.action);
    const context = p.resourceId && d.resourceType === 'order' ? await safeSupportContext(a.userId, a.role, p.resourceId) : undefined;
    const confirmed = p.action === 'GENERATE_SHIPPING_LABEL' ? context?.order?.status === 'shipped' : ['PAY_PICKUP_ONLINE','RETRY_PAYMENT'].includes(p.action) ? context?.order?.paymentStatus === 'success' : false;
    await audit(p, confirmed ? 'workflow_confirmed' : 'context_refreshed');
    return { context, message: confirmed ? p.action === 'GENERATE_SHIPPING_LABEL' ? 'Shipping label generated. Order is Shipped.' : 'Payment confirmed by the backend.' : 'Current account data refreshed. Check the order for its latest status.' };
}
export async function availableActions(a: Actor, orderId?: string) {
    const candidates = orderId ? ['OPEN_ORDER','OPEN_STORE_PICKUP','OPEN_DELIVERY_TRACKING','CANCEL_ORDER','CANCEL_PICKUP_RESERVATION','RESERVE_PICKUP_AGAIN','PAY_PICKUP_ONLINE','RETRY_PAYMENT','GENERATE_SHIPPING_LABEL','MARK_PICKUP_READY','CREATE_SUPPORT_TICKET'] : a.role === 'seller' ? ['OPEN_DELIVERY','OPEN_DELIVERY_SCANNER','OPEN_STORE_PICKUP','OPEN_PICKUP_SETTINGS','CREATE_SUPPORT_TICKET'] : ['OPEN_CHECKOUT','OPEN_STORE_PICKUP','OPEN_ADDRESS_SETTINGS','CREATE_SUPPORT_TICKET'];
    const actions = [];
    for (const type of candidates) {
        const d = SUPPORT_ACTIONS[type]; if (!d.roles.includes(a.role)) continue;
        try { await d.eligibility(a, orderId); actions.push({ id: type, type, label: d.label, resourceId: orderId, requiresConfirmation: d.requiresConfirmation }); } catch { /* Changed or unavailable resources produce no action. */ }
    }
    if (orderId) {
        try { const order = await ownedOrder(a, orderId); const item = order.items.find(i => a.role === 'customer' || String(i.seller) === a.userId); if (item) { const id = String(item.product); await SUPPORT_ACTIONS.OPEN_PRODUCT.eligibility(a, id); actions.push({ id: 'OPEN_PRODUCT', type: 'OPEN_PRODUCT', label: 'View Product', resourceId: id, requiresConfirmation: false }); } } catch { /* Product removed or unavailable. */ }
    }
    return actions;
}
