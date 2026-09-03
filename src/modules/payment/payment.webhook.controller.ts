import {
    Request,
    Response,
} from "express";

import crypto from "crypto";

import Order, {
    PaymentStatus,
    RefundStatus,
} from "../orders/order.model.js";

// =========================================
// RAZORPAY WEBHOOK CONTROLLER
// =========================================

export class PaymentWebhookController {

    static async handle(
        req: Request,
        res: Response
    ) {
        try {

            // =====================================
            // WEBHOOK SECRET
            // =====================================

            const webhookSecret =
                process.env.RAZORPAY_WEBHOOK_SECRET;

            if (!webhookSecret) {

                console.error(
                    "RAZORPAY_WEBHOOK_SECRET is not configured."
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Webhook secret is not configured.",
                });
            }

            // =====================================
            // RAW BODY
            // =====================================

            const rawBody =
                Buffer.isBuffer(req.body)
                    ? req.body
                    : null;

            if (!rawBody) {

                console.error(
                    "Razorpay webhook raw body is missing."
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Raw webhook body is required.",
                });
            }

            // =====================================
            // RAZORPAY SIGNATURE
            // =====================================

            const receivedSignature =
                String(
                    req.headers[
                    "x-razorpay-signature"
                    ] || "",
                );

            if (!receivedSignature) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Razorpay webhook signature is missing.",
                });
            }

            const expectedSignature =
                crypto
                    .createHmac(
                        "sha256",
                        webhookSecret,
                    )
                    .update(rawBody)
                    .digest("hex");

            const signaturesMatch =
                receivedSignature.length ===
                expectedSignature.length &&
                crypto.timingSafeEqual(
                    Buffer.from(
                        receivedSignature,
                    ),
                    Buffer.from(
                        expectedSignature,
                    ),
                );

            if (!signaturesMatch) {

                console.error(
                    "❌ INVALID RAZORPAY WEBHOOK SIGNATURE"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid webhook signature.",
                });
            }

            // =====================================
            // PARSE AFTER SIGNATURE VERIFICATION
            // =====================================

            const payload =
                JSON.parse(
                    rawBody.toString("utf8"),
                );

            const event =
                String(
                    payload?.event || "",
                ).trim();

            const eventId =
                String(
                    req.headers[
                    "x-razorpay-event-id"
                    ] || "",
                ).trim();

            console.log(
                "================================"
            );

            console.log(
                "RAZORPAY WEBHOOK:",
                event,
            );

            console.log(
                "EVENT ID:",
                eventId || "NOT PROVIDED",
            );

            // =====================================
            // SUPPORTED REFUND EVENTS
            // =====================================

            const supportedEvents =
                new Set([
                    "refund.created",
                    "refund.processed",
                    "refund.failed",
                    "refund.speed_changed",
                ]);

            if (
                !supportedEvents.has(event)
            ) {

                console.log(
                    "ℹ️ Ignoring Razorpay event:",
                    event,
                );

                return res.status(200).json({
                    success: true,
                    message:
                        "Event ignored.",
                });
            }

            // =====================================
            // REFUND ENTITY
            // =====================================

            const refund =
                payload?.payload?.refund?.entity;

            if (!refund?.id) {

                console.error(
                    "Refund entity missing from webhook."
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Refund information missing.",
                });
            }

            const refundId =
                String(refund.id);

            const paymentId =
                String(
                    refund.payment_id || "",
                );

            const refundAmount =
                Number(
                    refund.amount || 0,
                ) / 100;

            const refundStatus =
                String(
                    refund.status || "",
                )
                    .trim()
                    .toLowerCase();

            // =====================================
            // FIND ORDER
            // =====================================

            const order =
                paymentId
                    ? await Order.findOne({
                        razorpayPaymentId:
                            paymentId,
                    })
                    : await Order.findOne({
                        refundId,
                    });

            if (!order) {

                console.error(
                    "Order not found for Razorpay refund:",
                    {
                        refundId,
                        paymentId,
                    },
                );

                // Return 200 so Razorpay does not
                // endlessly retry a valid webhook
                // for an unknown historical order.
                return res.status(200).json({
                    success: true,
                    message:
                        "Order not found; webhook acknowledged.",
                });
            }

            // =====================================
            // DUPLICATE EVENT PROTECTION
            // =====================================

            const currentEventId =
                eventId || "";

            const alreadyProcessed =
                currentEventId &&
                Array.isArray(
                    (order as any)
                        .refundWebhookEventIds,
                ) &&
                (order as any)
                    .refundWebhookEventIds
                    .includes(
                        currentEventId,
                    );

            if (alreadyProcessed) {

                console.log(
                    "ℹ️ Duplicate Razorpay webhook ignored:",
                    currentEventId,
                );

                return res.status(200).json({
                    success: true,
                    message:
                        "Duplicate event already processed.",
                });
            }

            // =====================================
            // REFUND STATUS
            // =====================================

            let finalStatus:
                RefundStatus;

            if (
                event ===
                "refund.processed" ||
                refundStatus === "processed"
            ) {

                finalStatus =
                    RefundStatus.PROCESSED;

            } else if (
                event ===
                "refund.failed" ||
                refundStatus === "failed"
            ) {

                finalStatus =
                    RefundStatus.FAILED;

            } else {

                finalStatus =
                    RefundStatus.PENDING;
            }

            // =====================================
            // UPDATE ORDER
            // =====================================

            order.refundStatus =
                finalStatus;

            order.refundId =
                refundId;

            if (
                refundAmount > 0
            ) {
                order.refundedAmount =
                    refundAmount;
            }

            // Save the first time we receive
            // the refund event timestamp.
            if (!order.refundedAt) {
                order.refundedAt =
                    new Date();
            }

            // =====================================
            // EVENT ID
            // =====================================

            if (currentEventId) {

                const existingIds =
                    Array.isArray(
                        (order as any)
                            .refundWebhookEventIds,
                    )
                        ? (order as any)
                            .refundWebhookEventIds
                        : [];

                if (
                    !existingIds.includes(
                        currentEventId,
                    )
                ) {
                    (order as any)
                        .refundWebhookEventIds
                        .push(
                            currentEventId,
                        );
                }
            }

            await order.save();

            console.log(
                "✅ REFUND WEBHOOK PROCESSED:",
                {
                    orderId:
                        order._id.toString(),

                    refundId,

                    paymentId,

                    amount:
                        refundAmount,

                    status:
                        finalStatus,
                },
            );

            return res.status(200).json({
                success: true,
                message:
                    "Refund webhook processed successfully.",
            });

        } catch (error) {

            console.error(
                "❌ RAZORPAY WEBHOOK ERROR:",
                error,
            );

            return res.status(500).json({
                success: false,
                message:
                    "Webhook processing failed.",
            });
        }
    }
}