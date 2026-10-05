import mongoose from "mongoose";
import { EarningService } from "../payout/earning.service.js";
import Order, { OrderStatus, PaymentStatus } from "../orders/order.model.js";
import Cart from "../cart/cart.model.js";
import { NotificationService } from "../../notifications/notification.service.js";
import { NotificationRecipientRole, NotificationType } from "../../notifications/notification.model.js";
import { PAYMENT_RETRY_WINDOW_MS } from "../orders/payment-retry.js";

export async function releaseSellerNotifications(orderId: string) {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const order = await Order.findById(orderId).session(session);
            if (!order || !order.sellerReleasedAt || order.orderStatus === OrderStatus.CANCELLED || order.sellerNewOrderNotifiedAt) return;
            const cod = /^cod$/i.test(order.paymentMethod) || (order.fulfillmentType === "pickup" && order.paymentMethod === "pay_at_store");
            if (!cod && order.paymentStatus !== PaymentStatus.SUCCESS) return;
            for (const seller of new Set(order.items.filter(i => i.quantity > i.cancelledQuantity).map(i => String(i.seller)))) {
                await NotificationService.enqueue({ userId: seller, recipientRole: NotificationRecipientRole.SELLER,
                    type: NotificationType.NEW_ORDER, title: "New Order Received",
                    message: `You have received order #${orderId.slice(-8)}.`, orderId: order._id,
                    dedupeKey: `new-order:${orderId}:${seller}` }, session);
            }
            order.sellerNewOrderNotifiedAt = new Date();
            await order.save({ session });
        });
    } finally { await session.endSession(); }
}

export async function confirmCapturedPayment(orderId: string, paymentId: string, eventId?: string) {
    // Pipeline reads CURRENT cancellation state atomically, including a concurrent expiry.
    const previous = await Order.findOneAndUpdate({ _id: orderId,
        $or: [{ razorpayPaymentId: "" }, { razorpayPaymentId: null }, { razorpayPaymentId: paymentId }],
    }, [{ $set: {
        paymentStatus: PaymentStatus.SUCCESS, razorpayPaymentId: { $literal: paymentId },
        paymentRetryEnabled: false, paymentRetryExpiresAt: null,
        sellerReleasedAt: { $cond: [{ $eq: ["$orderStatus", OrderStatus.CANCELLED] },
            { $ifNull: ["$sellerReleasedAt", null] }, { $ifNull: ["$sellerReleasedAt", "$$NOW"] }] },
        __v: { $add: [{ $ifNull: ["$__v", 0] }, 1] },
        ...(eventId ? { paymentWebhookEventIds: { $setUnion: [{ $ifNull: ["$paymentWebhookEventIds", []] }, [eventId]] } } : {}),
    } }], { new: false });
    if (!previous) throw new Error("Conflicting payment reference");
    if (previous.fulfillmentType === "pickup") {
        const { PickupService } = await import("../orders/pickup.service.js");
        await Order.updateOne({ _id: orderId }, { $set: { paidAt: new Date(), paymentMethod: "online" }, $inc: { __v: 1 } });
        await PickupService.expireFor({ _id: orderId });
        await Order.updateOne({ _id: orderId, "pickup.status": { $in: ["expired", "cancelled"] } }, { $set: { "pickup.refundRequired": true } });
    }
    if (previous.fulfillmentType !== "pickup" && previous.paymentStatus !== PaymentStatus.SUCCESS) await Cart.updateOne({ user: previous.user }, { $set: { items: [] } });
    const { OrderService } = await import("../orders/order.service.js");
    await OrderService.reconcileCancelledPaidOrder(orderId);
    await releaseSellerNotifications(orderId);
    // A finance configuration outage must not report an already captured payment as failed.
    // The settlement scheduler retries this durable, idempotent ledger operation.
    try { await EarningService.reconcileOrder(orderId); }
    catch { console.error("Payment confirmed; earning reconciliation deferred", orderId); }
    await NotificationService.create({ userId: previous.user, recipientRole: NotificationRecipientRole.CUSTOMER,
        type: NotificationType.GENERAL, title: "Payment Successful", message: "Your payment was confirmed. Check your order for its latest status.",
        orderId: previous._id, dedupeKey: `payment-success:${orderId}` });
    return Order.findById(orderId);
}

export async function recordPaymentFailure(orderId: string, eventId: string) {
    const order = await Order.findOneAndUpdate({ _id: orderId,
        paymentStatus: { $ne: PaymentStatus.SUCCESS }, paymentRetryEnabled: true,
        sellerReleasedAt: null, orderStatus: { $in: [OrderStatus.PENDING, OrderStatus.PARTIALLY_CANCELLED] },
        paymentWebhookEventIds: { $ne: eventId },
    }, [{ $set: {
        paymentStatus: PaymentStatus.FAILED,
        paymentRetryExpiresAt: { $ifNull: ["$paymentRetryExpiresAt", new Date(Date.now() + PAYMENT_RETRY_WINDOW_MS)] },
        paymentWebhookEventIds: { $setUnion: [{ $ifNull: ["$paymentWebhookEventIds", []] }, [eventId]] },
        __v: { $add: [{ $ifNull: ["$__v", 0] }, 1] },
    } }], { new: true });
    if (order) await NotificationService.create({ userId: order.user, recipientRole: NotificationRecipientRole.CUSTOMER,
        type: NotificationType.GENERAL, title: "Payment Failed", message: "Your items are reserved while you retry payment. Check your order for the remaining time.",
        orderId: order._id, dedupeKey: `payment-failed:${orderId}:${eventId}` });
}
