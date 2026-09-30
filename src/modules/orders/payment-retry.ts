import { OrderStatus, PaymentStatus } from "./order.model.js";

export const PAYMENT_RETRY_WINDOW_MS = 15 * 60 * 1000;
export const onlineMethods = /^(online|razorpay)$/i;
export function expiredPaymentFilter(now = new Date()) {
    return {
        paymentRetryEnabled: true,
        paymentMethod: onlineMethods,
        paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
        orderStatus: { $in: [OrderStatus.PENDING, OrderStatus.PARTIALLY_CANCELLED] },
        sellerReleasedAt: null,
        $or: [
            { paymentRetryExpiresAt: { $lte: now, $ne: null } },
            { paymentRetryExpiresAt: null, createdAt: { $lte: new Date(now.getTime() - PAYMENT_RETRY_WINDOW_MS) } },
        ],
    };
}
export function retryDeadline(order: { paymentRetryExpiresAt?: Date | null; createdAt: Date }) {
    return order.paymentRetryExpiresAt || new Date(order.createdAt.getTime() + PAYMENT_RETRY_WINDOW_MS);
}
