import mongoose from 'mongoose';
import Order from '../orders/order.model.js';
import User from '../users/user.model.js';
import { defaultPickupSchedule, getSellerPickupAvailability } from '../orders/pickup-schedule.js';
import { SupportError, type SafeSupportContext, type SupportRole } from './support.types.js';
import { sanitizeSupportText } from './support.security.js';
export function supportId(value: unknown, name: string): string {
    if (typeof value !== 'string' || !mongoose.isObjectIdOrHexString(value)) throw new SupportError(400, 'Invalid ' + name + '.');
    return value;
}
const iso = (date: unknown) => date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
export async function safeSupportContext(userId: string, role: SupportRole, orderId?: string): Promise<SafeSupportContext> {
    const context: SafeSupportContext = { role };
    let storeId = role === 'seller' ? userId : undefined;
    if (orderId) {
        supportId(orderId, 'order ID');
        const ownership = role === 'customer' ? { user: userId } : { 'items.seller': userId, $or: [{ sellerReleasedAt: { $ne: null } }, { paymentMethod: /^(cod|cash on delivery|cash_on_delivery)$/i }, { paymentStatus: 'success' }] };
        const order = await Order.findOne({ _id: orderId, ...ownership }).select('orderStatus fulfillmentType paymentStatus paymentMethod refundStatus createdAt processingAt pickup.status pickup.expiresAt pickup.refundRequired pickup.sellerId items.seller items.quantity items.cancelledQuantity items.fulfilmentStatus items.refundStatus').lean();
        if (!order) throw new SupportError(404, 'Order not found or unavailable for this account.');
        const items = order.items.filter(i => role === 'customer' || String(i.seller) === userId);
        const active = items.filter(i => i.quantity > (i.cancelledQuantity || 0));
        let status: string = order.orderStatus;
        if (role === 'seller' && order.fulfillmentType !== 'pickup') {
            const states = active.map(i => i.fulfilmentStatus || order.orderStatus);
            status = !active.length || order.orderStatus === 'cancelled' ? 'cancelled' : states.every(s => s === 'delivered') ? 'delivered' : states.some(s => s === 'out_for_delivery') ? 'out_for_delivery' : states.some(s => ['shipped', 'delivered'].includes(s)) ? 'shipped' : states.some(s => s === 'processing') ? 'processing' : 'pending';
        }
        context.order = { reference: orderId.slice(-6).toUpperCase(), status, fulfillmentType: order.fulfillmentType || 'delivery', paymentStatus: order.paymentStatus, paymentMethod: String(order.paymentMethod || '').toLowerCase(), refundStatus: role === 'customer' ? order.refundStatus : (items.some(i => i.refundStatus === 'pending') ? 'pending' : items.some(i => i.refundStatus === 'failed') ? 'failed' : items.some(i => i.refundStatus === 'processed') ? 'processed' : 'none'), createdAt: iso(order.createdAt) || '',
            itemRefundStatuses: [...new Set(items.map(i => i.refundStatus).filter(s => s && s !== 'none'))],
            ...(order.fulfillmentType === 'pickup' ? { pickupStatus: order.pickup?.status, pickupExpiresAt: iso(order.pickup?.expiresAt), reservationElapsed: Boolean(order.pickup?.expiresAt && order.pickup.expiresAt <= new Date()), refundRequired: Boolean(order.pickup?.refundRequired) } : { deliveryStatus: status }) };
        if (role === 'customer' && order.fulfillmentType === 'pickup') storeId = String(order.pickup?.sellerId || '');
    }
    if (storeId && mongoose.isObjectIdOrHexString(storeId)) {
        const seller = await User.findById(storeId).select('business.pickupEnabled business.pickupSchedule').lean();
        if (seller) {
            const settings = seller.business?.pickupSchedule || defaultPickupSchedule();
            const available = getSellerPickupAvailability(seller);
            context.store = { pickupEnabled: Boolean(seller.business?.pickupEnabled), pickupSchedule: { timezone: settings.timezone, weeklySchedule: Object.fromEntries(Object.entries(settings.weeklySchedule).map(([day, row]) => [day, { enabled: row.enabled, open: row.open, close: row.close }])), specialClosureDates: settings.specialClosures.map(c => c.date), temporarilyClosed: settings.temporarilyClosed }, pickupAvailable: available.available, pickupReason: sanitizeSupportText(available.reason).slice(0, 200), hoursLabel: available.hoursLabel };
        }
    }
    return context;
}
