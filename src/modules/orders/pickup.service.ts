import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Order, { OrderStatus, PaymentStatus } from './order.model.js';
import Product from '../products/product.model.js';
import User from '../users/user.model.js';
import { OrderService, restoreStockForItem } from './order.service.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { NotificationRecipientRole, NotificationType } from '../../notifications/notification.model.js';
import { EarningService } from '../payout/earning.service.js';
import razorpay from '../payment/razorpay.js';

export const PICKUP_WINDOW_MS = 2 * 60 * 60 * 1000;
export const activePickup = ['reserved', 'ready'];
export function assertActivePickup(order: any, now = new Date()) {
    if (order?.fulfillmentType !== 'pickup' || !order.pickup || !activePickup.includes(order.pickup.status)) throw new Error('Pickup is no longer active');
    if (order.pickup.expiresAt.getTime() <= now.getTime()) throw new Error('Pickup reservation expired');
}
export class PickupService {
    static async eligibleSeller(id: unknown, session?: mongoose.ClientSession) {
        if (!mongoose.isValidObjectId(id)) throw new Error('Pickup seller not found');
        const seller = await User.findOne({ _id: id, role: 'seller', isActive: true }).select('name phone business').session(session || null);
        const b = seller?.business;
        if (!b?.pickupEnabled || !b.shopName?.trim() || !b.address?.trim() || !b.city?.trim() || !b.state?.trim() || !/^\d{6}$/.test(b.pincode || '') || !(b.shopPhone || seller?.phone)) throw new Error('Seller does not currently offer Store Pickup at a valid address');
        return seller!;
    }
    static reservation(seller: any, now = new Date()) {
        const b = seller.business;
        return { sellerId: seller._id, sellerName: b.shopName, address: { shopName: b.shopName, address: b.address,
            area: b.area, landmark: b.landmark, city: b.city, state: b.state, pincode: b.pincode,
            country: b.country || 'India', shopPhone: b.shopPhone || seller.phone },
            reservedAt: now, expiresAt: new Date(now.getTime() + PICKUP_WINDOW_MS), status: 'reserved',
            token: crypto.randomBytes(32).toString('hex'), code: `ECS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
            inventoryReleased: false, refundRequired: false };
    }
    static async availability(productId: string) {
        if (!mongoose.isValidObjectId(productId)) throw new Error('Invalid product ID');
        const product = await Product.findOne({ _id: productId, active: true });
        if (!product) return { available: false, reason: 'Store Pickup unavailable for this product' };
        if (product.stock <= 0) return { available: false, reason: 'Store Pickup unavailable: out of stock' };
        try {
            const seller = await this.eligibleSeller(product.seller);
            const b = seller.business!;
            // Explicit public allowlist: never expose the seller's account phone or private data.
            return { available: true, sellerName: b.shopName,
                address: { shopName: b.shopName, address: b.address, area: b.area, landmark: b.landmark,
                    city: b.city, state: b.state, pincode: b.pincode, country: b.country || 'India' },
                stock: product.stock };
        } catch { return { available: false, reason: 'Seller does not currently offer Store Pickup at a valid address' }; }
    }
    static async enqueue(order: any, status: string, session: mongoose.ClientSession) {
        const message = status === 'reserved' ? 'Your item is reserved for Store Pickup for 2 hours.' : `Store Pickup ${status.replace('_', ' ')}. Check the order for details.`;
        for (const [userId, recipientRole] of [[order.user, NotificationRecipientRole.CUSTOMER], [order.pickup.sellerId, NotificationRecipientRole.SELLER]] as const) {
            await NotificationService.enqueue({ userId, recipientRole, type: NotificationType.GENERAL,
                title: `Store Pickup: ${status.replace('_', ' ')}`, message, orderId: order._id,
                dedupeKey: `pickup:${order._id}:${status}:${userId}` }, session);
        }
    }
    static async notifyConfirmed(id: string) {
        const session = await mongoose.startSession();
        try { await session.withTransaction(async () => {
            const order = await Order.findById(id).session(session);
            if (order?.pickup) await this.enqueue(order, 'reserved', session);
        }); } catch { console.error('Pickup confirmation notification deferred', id); }
        finally { await session.endSession(); }
    }
    static async release(id: string, status: 'cancelled' | 'expired', userId?: string, now = new Date()) {
        const session = await mongoose.startSession();
        let changed = false;
        try { await session.withTransaction(async () => {
            changed = false;
            const order = await Order.findOne({ _id: id, fulfillmentType: 'pickup', ...(userId ? { user: userId } : {}) }).session(session);
            if (!order?.pickup) throw new Error('Pickup order not found');
            if (!activePickup.includes(order.pickup.status)) {
                if (status === 'cancelled' && order.pickup.status !== 'cancelled') throw new Error('Pickup cannot be cancelled');
                return;
            }
            if (status === 'cancelled') assertActivePickup(order, now);
            else if (order.pickup.expiresAt > now) return;
            for (const item of order.items) {
                const quantity = item.quantity - (item.cancelledQuantity || 0);
                if (quantity <= 0) continue;
                const product = await Product.findById(item.product).session(session);
                if (product) {
                    // Missing variants are recorded for seller reconciliation; do not invent replacement inventory.
                    const variantExists = !item.variant?.sku || product.variants.some(v => v.sku === item.variant!.sku);
                    const variant = item.variant?.sku ? product.variants.find(v => v.sku === item.variant!.sku) : undefined;
                    const options: Record<string, string> = { size: 'sizes', shade: 'shades', color: 'colors' };
                    const optionType = item.variant?.optionType || '';
                    const optionValue = item.variant?.optionValue || '';
                    const childExists = !optionValue || !options[optionType] || (variant as any)?.[options[optionType]]?.some((entry: any) => String(entry[optionType]).toLowerCase() === optionValue.toLowerCase());
                    if (variantExists && childExists) await restoreStockForItem(product, { variant: item.variant, quantity }, session);
                    else order.pickup.stockReleaseIssues = [...(order.pickup.stockReleaseIssues || []), String(item.product)];
                } else order.pickup.stockReleaseIssues = [...(order.pickup.stockReleaseIssues || []), String(item.product)];
                item.cancelledQuantity = item.quantity;
                item.cancelledAt = now;
            }
            order.pickup.status = status;
            order.pickup[status === 'expired' ? 'expiredAt' : 'cancelledAt'] = now;
            order.set('pickup.token', undefined);
            order.pickup.inventoryReleased = true;
            order.pickup.refundRequired = order.paymentStatus === PaymentStatus.SUCCESS && order.total > 0;
            order.orderStatus = OrderStatus.CANCELLED;
            order.paymentRetryEnabled = false;
            await order.save({ session });
            await this.enqueue(order, status, session);
            changed = true;
        }); } finally { await session.endSession(); }
        if (changed) {
            try { await OrderService.reconcileCancelledPaidOrder(id); await EarningService.reconcileOrder(id); }
            catch { console.error('Pickup refund requires reconciliation', id); }
        }
    }
    static async expireFor(filter: Record<string, unknown> = {}, now = new Date()) {
        const orders = await Order.find({ ...filter, fulfillmentType: 'pickup', 'pickup.status': { $in: activePickup }, 'pickup.expiresAt': { $lte: now } }).select('_id').limit(200);
        for (const order of orders) await this.release(String(order._id), 'expired', undefined, now);
    }
    static async detail(id: string, actor: string, seller = false) {
        if (!mongoose.isValidObjectId(id)) throw new Error('Invalid pickup order ID');
        const ownership = seller ? { 'pickup.sellerId': actor } : { user: actor };
        await this.expireFor({ _id: id, ...ownership });
        const order = await Order.findOne({ _id: id, fulfillmentType: 'pickup', ...ownership })
            .select(seller ? '' : '+pickup.token').populate('user', 'name');
        if (!order) throw new Error('Pickup order not found');
        const value = order.toJSON();
        if (value.pickup && !activePickup.includes(value.pickup.status)) delete value.pickup.token;
        return { ...value, serverNow: new Date().toISOString() };
    }
    static async validate(reference: string, sellerId: string) {
        const ref = String(reference || '').trim();
        if (!ref || ref.length > 100) throw new Error('Invalid pickup reference');
        const byId = mongoose.isValidObjectId(ref);
        const order = await Order.findOne({ fulfillmentType: 'pickup', 'pickup.sellerId': sellerId,
            ...(byId ? { _id: ref } : /^[a-f0-9]{64}$/.test(ref) ? { 'pickup.token': ref } : { 'pickup.code': ref.toUpperCase() }) });
        if (!order) throw new Error('Pickup code is invalid or belongs to another seller');
        const detail = await this.detail(String(order._id), sellerId, true);
        assertActivePickup(detail);
        return detail;
    }
    static async sellerAction(id: string, sellerId: string, action: 'ready' | 'cash' | 'complete') {
        await this.expireFor({ _id: id, 'pickup.sellerId': sellerId });
        const session = await mongoose.startSession();
        try { await session.withTransaction(async () => {
            const order = await Order.findOne({ _id: id, fulfillmentType: 'pickup', 'pickup.sellerId': sellerId }).session(session);
            assertActivePickup(order);
            if (!order?.pickup) throw new Error('Pickup order not found');
            if (action === 'ready') {
                if (order.pickup.status === 'ready') return;
                order.pickup.status = 'ready';
            } else if (action === 'cash') {
                if (order.paymentMethod === 'cash_at_store' && order.paymentStatus === PaymentStatus.SUCCESS) return;
                if (order.paymentMethod !== 'pay_at_store' || order.paymentStatus !== PaymentStatus.PENDING || order.razorpayOrderId || order.paymentCreationLockUntil && order.paymentCreationLockUntil > new Date()) throw new Error('Cash collection is unavailable while online payment is pending or already paid');
                order.paymentMethod = 'cash_at_store';
                order.paymentStatus = PaymentStatus.SUCCESS;
                order.paidAt = new Date();
                order.paymentCollectedBySeller = new mongoose.Types.ObjectId(sellerId);
            } else {
                if (order.total > 0 && order.paymentStatus !== PaymentStatus.SUCCESS) throw new Error('Collect or verify payment before completing pickup');
                order.pickup.status = 'picked_up'; order.pickup.pickedUpAt = new Date();
                order.set('pickup.token', undefined);
                // Stock was deducted during reservation; completion must never deduct it again.
                order.orderStatus = OrderStatus.DELIVERED; order.deliveredAt = new Date();
                for (const item of order.items) { item.fulfilmentStatus = 'delivered'; item.deliveredAt = order.deliveredAt; }
            }
            await order.save({ session });
            await this.enqueue(order, action === 'cash' ? 'payment_received' : order.pickup.status, session);
        }); } finally { await session.endSession(); }
        if (action === 'complete') {
            try { await EarningService.reconcileOrder(id); }
            catch { console.error('Pickup completed; earning reconciliation deferred', id); }
        }
        return this.detail(id, sellerId, true);
    }
    static async createPayment(id: string, userId: string) {
        await this.expireFor({ _id: id, user: userId });
        const now = new Date(); const lock = new Date(now.getTime() + 60_000);
        const order = await Order.findOneAndUpdate({ _id: id, user: userId, fulfillmentType: 'pickup',
            'pickup.status': { $in: activePickup }, 'pickup.expiresAt': { $gt: now },
            paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
            paymentMethod: { $in: ['pay_at_store', 'online', 'razorpay'] },
            $or: [{ paymentCreationLockUntil: null }, { paymentCreationLockUntil: { $lte: now } }],
        }, { $set: { paymentCreationLockUntil: lock, paymentMethod: 'online' }, $inc: { __v: 1 } }, { new: true });
        if (!order) throw new Error('Pickup payment is unavailable or already in progress');
        try {
            assertActivePickup(order);
            const amount = Math.round(order.total * 100);
            if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid payment amount');
            const gateway = order.razorpayOrderId ? await razorpay.orders.fetch(order.razorpayOrderId)
                : await razorpay.orders.create({ amount, currency: 'INR', receipt: id, notes: { ecommerce_order_id: id } });
            if (Number(gateway.amount) !== amount || gateway.currency !== 'INR' || !['created', 'attempted'].includes(gateway.status)) throw new Error('Payment confirmation pending; refresh the order');
            const updated = await Order.findOneAndUpdate({ _id: id, paymentCreationLockUntil: lock,
                'pickup.status': { $in: activePickup }, 'pickup.expiresAt': { $gt: new Date() }, paymentStatus: { $ne: PaymentStatus.SUCCESS } },
                { $set: { razorpayOrderId: gateway.id }, $inc: { __v: 1 } }, { new: true });
            if (!updated) throw new Error('Pickup changed before payment could start');
            return { razorpayOrder: gateway, keyId: process.env.RAZORPAY_KEY_ID, serverNow: new Date().toISOString() };
        } finally { await Order.updateOne({ _id: id, paymentCreationLockUntil: lock }, { $unset: { paymentCreationLockUntil: 1 } }); }
    }
}
