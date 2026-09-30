import mongoose from "mongoose";
import { confirmCapturedPayment, releaseSellerNotifications } from "./payment-lifecycle.js";
import { retryDeadline, onlineMethods } from "../orders/payment-retry.js";
import razorpay from "./razorpay.js";

import Order, {

    OrderStatus,

    PaymentStatus,

} from "../orders/order.model.js";

import crypto from "crypto";

import Cart from "../cart/cart.model.js";

import {
    NotificationService,
} from "../../notifications/notification.service.js";

import {
    NotificationRecipientRole,
    NotificationType,
} from "../../notifications/notification.model.js";

export class PaymentService {

    static readonly PAYMENT_RETRY_WINDOW_MS =
        15 * 60 * 1000;

    // =========================================
    // RELEASE CONFIRMED ONLINE ORDER TO SELLERS
    // =========================================
    //
    // Both /payment/verify and payment.captured
    // may confirm the same payment. Claiming the
    // seller notification atomically guarantees
    // that only one of those paths sends NEW_ORDER.
    //
    // sellerReleasedAt is set separately by the
    // successful-payment path. Fully cancelled
    // orders are never released/notified.
    // =========================================

    static notifySellersForConfirmedOrder = releaseSellerNotifications;

    static async createPayment(orderId: string, userId: string) {
        if (!mongoose.isValidObjectId(orderId)) throw new Error("Invalid order ID");
        const { OrderService } = await import("../orders/order.service.js");
        await OrderService.expirePaymentOrder(orderId);
        const now = new Date();
        const lockUntil = new Date(now.getTime() + 60_000);
        const order = await Order.findOneAndUpdate({ _id: orderId, user: userId,
            paymentMethod: onlineMethods, paymentRetryEnabled: true,
            paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
            orderStatus: { $in: [OrderStatus.PENDING, OrderStatus.PARTIALLY_CANCELLED] },
            sellerReleasedAt: null,
            $or: [{ paymentCreationLockUntil: null }, { paymentCreationLockUntil: { $lte: now } }],
        }, { $set: { paymentCreationLockUntil: lockUntil } }, { new: true });
        if (!order) throw new Error("Payment is already confirmed, unavailable, expired or being prepared. Refresh your order.");
        try {
            if (retryDeadline(order).getTime() <= Date.now()) throw new Error("Payment time expired");
            const amount = Math.round(order.total * 100);
            if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid order amount");
            const isRetry = order.paymentStatus === PaymentStatus.FAILED;
            const gateway = order.razorpayOrderId
                ? await razorpay.orders.fetch(order.razorpayOrderId)
                : await razorpay.orders.create({ amount, currency: "INR", receipt: String(order._id),
                    notes: { ecommerce_order_id: String(order._id) } });
            if (Number(gateway.amount) !== amount || gateway.currency !== "INR") throw new Error("Gateway amount mismatch");
            if (retryDeadline(order).getTime() <= Date.now()) throw new Error("Payment time expired");
            if (!["created", "attempted"].includes(gateway.status)) throw new Error("Payment confirmation pending. Refresh your order.");
            const updated = await Order.findOneAndUpdate({ _id: order._id,
                paymentCreationLockUntil: lockUntil,
                paymentStatus: order.paymentStatus, paymentRetryEnabled: true, sellerReleasedAt: null,
                orderStatus: { $in: [OrderStatus.PENDING, OrderStatus.PARTIALLY_CANCELLED] },
            }, { $set: { razorpayOrderId: gateway.id, paymentStatus: PaymentStatus.PENDING },
                $inc: { paymentAttemptCount: isRetry ? 1 : 0, __v: 1 } }, { new: true });
            if (!updated) throw new Error("Order changed. Refresh before paying.");
            return { order: updated, razorpayOrder: gateway, keyId: process.env.RAZORPAY_KEY_ID, isRetry, serverTime: new Date().toISOString() };
        } finally { await Order.updateOne({ _id: order._id, paymentCreationLockUntil: lockUntil }, { $set: { paymentCreationLockUntil: null } }); }
    }

    static async verifyPayment(data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }, userId: string) {
        const { razorpay_order_id: gatewayId, razorpay_payment_id: paymentId, razorpay_signature: signature } = data;
        if (!gatewayId || !paymentId || !/^[a-f0-9]{64}$/i.test(signature || "")) throw new Error("Invalid payment verification data");
        const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${gatewayId}|${paymentId}`).digest();
        if (!crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new Error("Invalid payment signature");
        const order = await Order.findOne({ razorpayOrderId: gatewayId, user: userId });
        if (!order) throw new Error("Order not found");
        const payment = await razorpay.payments.fetch(paymentId);
        if (payment.order_id !== gatewayId || payment.status !== "captured" || payment.currency !== "INR" || Number(payment.amount) !== Math.round(order.total * 100)) {
            throw new Error("Payment confirmation pending or payment does not match this order");
        }
        return confirmCapturedPayment(String(order._id), paymentId);
    }

    static async refundPayment(

        refundRequestId: string,

        razorpayPaymentId: string,

        amount: number,

    ) {

        const requestId =

            String(refundRequestId || "").trim();

        if (!requestId) {

            throw new Error(

                "Refund request ID is required."

            );

        }

        if (!razorpayPaymentId) {

            throw new Error(

                "Razorpay payment ID is missing."

            );

        }

        if (

            !Number.isFinite(amount) ||

            amount <= 0

        ) {

            throw new Error(

                "Invalid refund amount."

            );

        }

        const refundAmount =

            Math.round(Number(amount) * 100);

        if (refundAmount < 100) {

            throw new Error(

                "Refund amount must be at least ₹1."

            );

        }

        const keyId =

            process.env.RAZORPAY_KEY_ID;

        const keySecret =

            process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {

            throw new Error(

                "Razorpay credentials are not configured."

            );

        }

        const authorization =

            Buffer.from(

                `${keyId}:${keySecret}`,

            ).toString("base64");

        // =====================================

        // CHECK PAYMENT STATE / REFUND CAPACITY

        // =====================================

        const payment =

            await razorpay.payments.fetch(

                razorpayPaymentId

            );

        if (!payment) {

            throw new Error(

                "Razorpay payment could not be found for refund."

            );

        }

        if (

            String(payment.status || "")

                .trim()

                .toLowerCase() !== "captured"

        ) {

            throw new Error(

                `Payment cannot be refunded. Current Razorpay status: ${payment.status || "unknown"}`

            );

        }

        const paymentAmount =

            Number(payment.amount || 0);

        const alreadyRefundedAmount =

            Number(payment.amount_refunded || 0);

        const availableRefundAmount =

            paymentAmount -

            alreadyRefundedAmount;

        if (

            refundAmount >

            availableRefundAmount

        ) {

            throw new Error(

                "Refund amount exceeds the remaining refundable payment amount."

            );

        }

        // =====================================

        // CREATE REFUND

        // =====================================

        //

        // NOTE:

        // Razorpay's documented idempotency/reference

        // field for refunds is `receipt`. We therefore

        // intentionally do not use an undocumented custom

        // HTTP idempotency header here.

        // =====================================

        const response =

            await fetch(

                `https://api.razorpay.com/v1/payments/${encodeURIComponent(

                    razorpayPaymentId,

                )}/refund`,

                {

                    method: "POST",

                    headers: {

                        "Content-Type":

                            "application/json",

                        Authorization:

                            `Basic ${authorization}`,

                    },

                    body: JSON.stringify({

                        amount:

                            refundAmount,

                        speed:

                            "normal",

                        receipt:

                            requestId,

                        notes: {

                            refund_request_id:

                                requestId,

                        },

                    }),

                },

            );

        const data =

            await response.json();

        if (!response.ok) {

            console.error(

                "RAZORPAY REFUND ERROR:",

                data,

            );

            // If the receipt was already used, retrieve

            // existing refunds and return the matching one.

            // This makes a repeated request safe instead of

            // creating a second refund.

            const duplicateReceipt =

                String(

                    data?.error?.description || ""

                )

                    .toLowerCase()

                    .includes("duplicate receipt");

            if (duplicateReceipt) {

                try {

                    const existingResponse =

                        await fetch(

                            `https://api.razorpay.com/v1/payments/${encodeURIComponent(

                                razorpayPaymentId,

                            )}/refunds?count=100`,

                            {

                                method: "GET",

                                headers: {

                                    Authorization:

                                        `Basic ${authorization}`,

                                },

                            },

                        );

                    const existingData =

                        await existingResponse.json();

                    if (existingResponse.ok) {

                        const existingRefund =

                            Array.isArray(

                                existingData?.items

                            )

                                ? existingData.items.find(

                                    (refund: any) =>

                                        String(

                                            refund?.receipt || ""

                                        ) === requestId

                                )

                                : null;

                        if (existingRefund) {

                            console.log(

                                "ℹ️ Existing Razorpay refund reused:",

                                existingRefund.id,

                            );

                            return existingRefund;

                        }

                    }

                } catch (lookupError) {

                    console.error(

                        "Existing refund lookup failed:",

                        lookupError,

                    );

                }

            }

            throw new Error(

                data?.error?.description ||

                "Unable to process Razorpay refund."

            );

        }

        console.log(

            "✅ RAZORPAY REFUND CREATED:",

            {

                id: data?.id,

                receipt: data?.receipt,

                paymentId:

                    data?.payment_id,

                amount:

                    Number(data?.amount || 0) /

                    100,

                status:

                    data?.status,

            },

        );

        return data;

    }

}
