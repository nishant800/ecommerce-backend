import crypto from "crypto";
import type { Request, Response } from "express";
import Order, { PaymentStatus, RefundStatus } from "../orders/order.model.js";
import Cart from "../cart/cart.model.js";
import {
    NotificationService,
} from "../../notifications/notification.service.js"
import {
    NotificationRecipientRole,
    NotificationType,
} from "../../notifications/notification.model.js";
// =========================================
// HELPERS
// =========================================
const roundMoney = (value: number): number =>
    Math.round((value + Number.EPSILON) * 100) / 100;
const clampNonNegative = (value: number): number =>
    Math.max(0, roundMoney(value));
function getRefundStatus(
    event: string,
    razorpayStatus?: string,
): RefundStatus {
    const status = String(
        razorpayStatus || "",
    )
        .trim()
        .toLowerCase();
    if (
        event === "refund.processed" ||
        status === "processed"
    ) {
        return RefundStatus.PROCESSED;
    }
    if (
        event === "refund.failed" ||
        status === "failed"
    ) {
        return RefundStatus.FAILED;
    }
    return RefundStatus.PENDING;
}
function recalculateAggregateRefundStatus(
    order: any,
): void {
    const refunds = Array.isArray(order.refunds)
        ? order.refunds
        : [];
    if (refunds.length === 0) {
        order.refundStatus = RefundStatus.NONE;
        return;
    }
    if (
        refunds.some(
            (refund: any) =>
                refund.status ===
                RefundStatus.PENDING,
        )
    ) {
        order.refundStatus =
            RefundStatus.PENDING;
        return;
    }
    if (
        refunds.some(
            (refund: any) =>
                refund.status ===
                RefundStatus.FAILED,
        )
    ) {
        order.refundStatus =
            RefundStatus.FAILED;
        return;
    }
    if (
        refunds.some(
            (refund: any) =>
                refund.status ===
                RefundStatus.PROCESSED,
        )
    ) {
        order.refundStatus =
            RefundStatus.PROCESSED;
        return;
    }
    order.refundStatus = RefundStatus.NONE;
}
function timingSafeSignatureMatch(
    rawBody: Buffer,
    receivedSignature: string,
    secret: string,
): boolean {
    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
    const expectedBuffer = Buffer.from(
        expectedSignature,
        "utf8",
    );
    const receivedBuffer = Buffer.from(
        String(receivedSignature || ""),
        "utf8",
    );
    if (
        expectedBuffer.length !==
        receivedBuffer.length
    ) {
        return false;
    }
    return crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer,
    );
}
// =========================================
// RAZORPAY WEBHOOK CONTROLLER
// =========================================
export class PaymentWebhookController {
    static async handle(
        req: Request,
        res: Response,
    ) {
        try {
            // =====================================
            // WEBHOOK SECRET
            // =====================================
            const webhookSecret =
                process.env.RAZORPAY_WEBHOOK_SECRET;
            if (!webhookSecret) {
                console.error(
                    "RAZORPAY_WEBHOOK_SECRET is not configured.",
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
            // Razorpay signature MUST be verified
            // against the exact raw request body.
            const rawBody =
                Buffer.isBuffer(req.body)
                    ? req.body
                    : null;
            if (!rawBody) {
                console.error(
                    "Razorpay webhook raw body is missing.",
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
            if (
                !receivedSignature ||
                !timingSafeSignatureMatch(
                    rawBody,
                    receivedSignature,
                    webhookSecret,
                )
            ) {
                console.error(
                    "❌ INVALID RAZORPAY WEBHOOK SIGNATURE",
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
            let payload: any;
            try {
                payload = JSON.parse(
                    rawBody.toString("utf8"),
                );
            } catch {
                console.error(
                    "Invalid Razorpay webhook JSON.",
                );
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid webhook JSON payload.",
                });
            }
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
                "================================",
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
            const supportedEvents = new Set([
                "payment.captured",
                "payment.failed",
                "refund.created",
                "refund.processed",
                "refund.failed",
                "refund.speed_changed",
            ]);
            if (!supportedEvents.has(event)) {
                console.log(
                    "ℹ️ Ignoring Razorpay event:",
                    event,
                );
                return res.status(200).json({
                    success: true,
                    message: "Event ignored.",
                });
            }
            // =====================================
            // PAYMENT EVENTS
            // =====================================
            if (
                event === "payment.captured" ||
                event === "payment.failed"
            ) {
                const payment =
                    payload?.payload?.payment?.entity;
                const paymentId = String(
                    payment?.id || "",
                ).trim();
                const razorpayOrderId = String(
                    payment?.order_id || "",
                ).trim();
                if (!paymentId || !razorpayOrderId) {
                    console.error(
                        "Razorpay payment entity/order information missing.",
                    );
                    return res.status(200).json({
                        success: true,
                        message: "Payment payload ignored.",
                    });
                }
                const order = await Order.findOne({
                    razorpayOrderId,
                });
                if (!order) {
                    console.error(
                        "Order not found for Razorpay payment:",
                        { paymentId, razorpayOrderId },
                    );
                    return res.status(200).json({
                        success: true,
                        message: "Order not found; webhook acknowledged.",
                    });
                }
                // MongoDB performs the event-ID check and update atomically.
                // No stale Mongoose document save is used for payment events.
                const eventFilter = eventId
                    ? { paymentWebhookEventIds: { $ne: eventId } }
                    : {};
                if (event === "payment.captured") {
                    const paymentStatus = String(
                        payment?.status || "",
                    )
                        .trim()
                        .toLowerCase();
                    if (paymentStatus !== "captured") {
                        return res.status(400).json({
                            success: false,
                            message: "Invalid captured payment payload.",
                        });
                    }
                    const expectedAmountPaise = Math.round(
                        Number(order.total) * 100,
                    );
                    const actualAmountPaise = Number(
                        payment?.amount,
                    );
                    if (
                        !Number.isFinite(actualAmountPaise) ||
                        actualAmountPaise !== expectedAmountPaise
                    ) {
                        return res.status(400).json({
                            success: false,
                            message: "Payment amount does not match order amount.",
                        });
                    }
                    if (
                        String(payment?.currency || "")
                            .trim()
                            .toUpperCase() !== "INR"
                    ) {
                        return res.status(400).json({
                            success: false,
                            message: "Unexpected payment currency.",
                        });
                    }
                    // Do not replace an already-recorded different payment ID.
                    const updatedOrder = await Order.findOneAndUpdate(
                        {
                            _id: order._id,
                            razorpayOrderId,
                            ...eventFilter,
                            $or: [
                                { razorpayPaymentId: { $exists: false } },
                                { razorpayPaymentId: null },
                                { razorpayPaymentId: "" },
                                { razorpayPaymentId: paymentId },
                            ],
                        },
                        {
                            $set: {
                                paymentStatus: PaymentStatus.SUCCESS,
                                razorpayPaymentId: paymentId,
                            },
                            ...(eventId
                                ? { $addToSet: { paymentWebhookEventIds: eventId } }
                                : {}),
                        },
                        { new: false },
                    );
                    if (!updatedOrder) {
                        const latest = await Order.findById(order._id);
                        if (eventId && latest?.paymentWebhookEventIds?.includes(eventId)) {
                            // The payment event itself is already recorded,
                            // but a previous request may have failed after
                            // saving payment success and before completing
                            // cancellation/refund reconciliation.
                            //
                            // Re-run reconciliation on duplicate captured
                            // events. The OrderService method atomically
                            // reserves deterministic refund request IDs, so
                            // this is safe and provides crash/retry recovery.
                            if (
                                latest.paymentStatus === PaymentStatus.SUCCESS &&
                                String(latest.razorpayPaymentId || "") === paymentId
                            ) {
                                try {
                                    const {
                                        OrderService,
                                    } = await import(
                                        "../orders/order.service.js"
                                    );
                                    await OrderService
                                        .reconcileCancelledPaidOrder(
                                            latest._id.toString(),
                                        );
                                } catch (reconcileError) {
                                    console.error(
                                        "DUPLICATE PAYMENT WEBHOOK CANCELLATION RECONCILIATION ERROR:",
                                        reconcileError,
                                    );
                                    return res.status(500).json({
                                        success: false,
                                        message:
                                            "Payment was already recorded, but cancellation reconciliation failed.",
                                    });
                                }
                            }
                            return res.status(200).json({
                                success: true,
                                message: "Duplicate payment event already processed.",
                            });
                        }
                        console.error("Payment webhook update rejected: conflicting payment ID or order state.");
                        return res.status(409).json({
                            success: false,
                            message: "Payment webhook update conflict.",
                        });
                    }
                    const transitionedToSuccess =
                        updatedOrder.paymentStatus !== PaymentStatus.SUCCESS;
                    // Stock is intentionally NOT changed here.
                    // Checkout already reserves/deducts it.
                    if (transitionedToSuccess) {
                        try {
                            await Cart.findOneAndUpdate(
                                { user: order.user },
                                { items: [] },
                            );
                        } catch (cartError) {
                            console.error(
                                "PAYMENT WEBHOOK CART CLEAR ERROR:",
                                cartError,
                            );
                        }
                    }
                    // =====================================
                    // RECONCILE CANCELLED PAID ORDER
                    // =====================================
                    //
                    // If cancellation happened while the
                    // payment was still pending, the order
                    // is now paid and the missing refund
                    // must be created.
                    //
                    // Run this even when payment was already
                    // SUCCESS before this webhook. The
                    // reconciliation method is idempotent and
                    // atomically reserves deterministic refund
                    // request IDs.
                    //
                    // Dynamic import avoids introducing a
                    // static dependency cycle.
                    // =====================================
                    try {
                        const {
                            OrderService,
                        } = await import(
                            "../orders/order.service.js"
                        );
                        await OrderService
                            .reconcileCancelledPaidOrder(
                                order._id.toString(),
                            );
                    } catch (reconcileError) {
                        // Payment capture is already persisted.
                        //
                        // Return a retryable response so Razorpay
                        // can deliver this event again. Duplicate
                        // captured events re-run reconciliation
                        // safely through the atomic/idempotent
                        // OrderService method.
                        console.error(
                            "PAYMENT WEBHOOK CANCELLATION RECONCILIATION ERROR:",
                            reconcileError,
                        );
                        return res.status(500).json({
                            success: false,
                            message:
                                "Payment captured, but cancellation reconciliation failed.",
                        });
                    }
                    console.log(
                        "✅ PAYMENT CAPTURED WEBHOOK PROCESSED:",
                        {
                            orderId: order._id.toString(),
                            paymentId,
                            transitionedToSuccess,
                        },
                    );
                    return res.status(200).json({
                        success: true,
                        message: "Payment captured webhook processed successfully.",
                    });
                }
                // A failed event cannot downgrade an already-captured payment.
                // Both event recording and status transition are atomic.
                const failedUpdate = await Order.findOneAndUpdate(
                    { _id: order._id, razorpayOrderId, ...eventFilter },
                    [
                        {
                            $set: {
                                paymentStatus: {
                                    $cond: [
                                        { $eq: ["$paymentStatus", PaymentStatus.SUCCESS] },
                                        PaymentStatus.SUCCESS,
                                        PaymentStatus.FAILED,
                                    ],
                                },
                                ...(eventId
                                    ? {
                                        paymentWebhookEventIds: {
                                            $setUnion: [
                                                { $ifNull: ["$paymentWebhookEventIds", []] },
                                                [eventId],
                                            ],
                                        },
                                    }
                                    : {}),
                            },
                        },
                    ],
                    { new: false },
                );
                if (!failedUpdate) {
                    return res.status(200).json({
                        success: true,
                        message: "Duplicate payment event already processed.",
                    });
                }
                console.log(
                    "ℹ️ PAYMENT FAILED WEBHOOK PROCESSED:",
                    {
                        orderId: order._id.toString(),
                        paymentId,
                        paymentStatus: (await Order.findById(order._id))?.paymentStatus,
                    },
                );
                return res.status(200).json({
                    success: true,
                    message: "Payment failed webhook processed successfully.",
                });
            }
            // =====================================
            // REFUND ENTITY
            // =====================================
            const refund =
                payload?.payload?.refund?.entity;
            if (
                !refund?.id ||
                !refund?.payment_id
            ) {
                console.error(
                    "Refund entity/payment information missing.",
                );
                return res.status(200).json({
                    success: true,
                    message:
                        "Refund payload ignored.",
                });
            }
            const refundId =
                String(refund.id).trim();
            const paymentId =
                String(
                    refund.payment_id || "",
                ).trim();
            const refundAmount =
                roundMoney(
                    Number(
                        refund.amount || 0,
                    ) / 100,
                );
            const razorpayRefundStatus =
                String(
                    refund.status || "",
                )
                    .trim()
                    .toLowerCase();
            const finalStatus =
                getRefundStatus(
                    event,
                    razorpayRefundStatus,
                );
            // Our PaymentService sends:
            // notes.refund_request_id
            // and also uses receipt=requestId.
            const requestIdFromNotes =
                String(
                    refund?.notes
                        ?.refund_request_id || "",
                ).trim();
            const receipt =
                String(
                    refund?.receipt || "",
                ).trim();
            const requestId =
                requestIdFromNotes ||
                receipt;
            // =====================================
            // FIND ORDER
            // =====================================
            const order =
                await Order.findOne({
                    $or: [
                        {
                            razorpayPaymentId:
                                paymentId,
                        },
                        {
                            "refunds.razorpayRefundId":
                                refundId,
                        },
                        ...(requestId
                            ? [
                                {
                                    "refunds.requestId":
                                        requestId,
                                },
                            ]
                            : []),
                    ],
                });
            if (!order) {
                console.error(
                    "Order not found for Razorpay refund:",
                    {
                        refundId,
                        paymentId,
                        requestId,
                    },
                );
                // Acknowledge valid webhooks so
                // Razorpay does not endlessly retry
                // an old/unmatched refund.
                return res.status(200).json({
                    success: true,
                    message:
                        "Order not found; webhook acknowledged.",
                });
            }
            // =====================================
            // DUPLICATE EVENT PROTECTION
            // =====================================
            const alreadyProcessed =
                !!eventId &&
                Array.isArray(
                    order.refundWebhookEventIds,
                ) &&
                order.refundWebhookEventIds.includes(
                    eventId,
                );
            if (alreadyProcessed) {
                console.log(
                    "ℹ️ Duplicate Razorpay webhook ignored:",
                    eventId,
                );
                return res.status(200).json({
                    success: true,
                    message:
                        "Duplicate event already processed.",
                });
            }
            // =====================================
            // FIND INDIVIDUAL REFUND RECORD
            // =====================================
            let refundRecord: any = null;
            if (requestId) {
                refundRecord =
                    Array.isArray(order.refunds)
                        ? order.refunds.find(
                            (record: any) =>
                                record.requestId ===
                                requestId,
                        )
                        : null;
            }
            if (!refundRecord) {
                refundRecord =
                    Array.isArray(order.refunds)
                        ? order.refunds.find(
                            (record: any) =>
                                record.razorpayRefundId ===
                                refundId,
                        )
                        : null;
            }
            // =====================================
            // LEGACY REFUND FALLBACK
            // =====================================
            // Keeps old order-level refunds working.
            // New product-level refunds should always
            // have an order.refunds[] record.
            if (!refundRecord) {
                console.warn(
                    "Razorpay refund webhook: no matching refund record.",
                    {
                        orderId:
                            order._id.toString(),
                        refundId,
                        paymentId,
                        requestId,
                    },
                );
                // Preserve event-id duplicate protection.
                if (eventId) {
                    const existingIds =
                        Array.isArray(
                            order.refundWebhookEventIds,
                        )
                            ? order.refundWebhookEventIds
                            : [];
                    if (
                        !existingIds.includes(
                            eventId,
                        )
                    ) {
                        order.refundWebhookEventIds =
                            [
                                ...existingIds,
                                eventId,
                            ];
                    }
                }
                // Legacy order-level handling only
                // when the webhook itself identifies
                // the existing legacy refund.
                if (
                    order.refundId === refundId
                ) {
                    order.refundStatus =
                        finalStatus;
                    order.refundId =
                        refundId;
                    if (
                        finalStatus ===
                        RefundStatus.PROCESSED
                    ) {
                        order.refundedAmount =
                            roundMoney(
                                Number(
                                    order.refundedAmount ||
                                    0,
                                ) +
                                refundAmount,
                            );
                        order.refundedAt =
                            order.refundedAt ||
                            new Date();
                    }
                    await order.save();
                    return res.status(200).json({
                        success: true,
                        message:
                            "Legacy refund webhook processed.",
                    });
                }
                await order.save();
                return res.status(200).json({
                    success: true,
                    message:
                        "Refund record not found; webhook acknowledged.",
                });
            }
            // =====================================
            // REFUND RECORD STATE
            // =====================================
            const previousStatus =
                refundRecord.status as RefundStatus;
            const amountForRecord =
                roundMoney(
                    Number(
                        refundRecord.amount || 0,
                    ),
                );
            const effectiveAmount =
                amountForRecord > 0
                    ? amountForRecord
                    : refundAmount;
            // =====================================
            // IDENTIFIERS
            // =====================================
            refundRecord.razorpayRefundId =
                refundId;
            refundRecord.razorpayPaymentId =
                paymentId;
            // =====================================
            // PROTECT AGAINST OUT-OF-ORDER EVENTS
            // =====================================
            // Processed is final for this refund.
            // A later pending/failed event must not
            // downgrade a processed refund.
            // Failed is also treated as final for
            // this refund record. A new refund attempt
            // should create a new refund request ID.
            let nextStatus =
                finalStatus;
            if (
                previousStatus ===
                RefundStatus.PROCESSED &&
                finalStatus !==
                RefundStatus.PROCESSED
            ) {
                nextStatus =
                    RefundStatus.PROCESSED;
            } else if (
                previousStatus ===
                RefundStatus.FAILED &&
                finalStatus ===
                RefundStatus.PENDING
            ) {
                nextStatus =
                    RefundStatus.FAILED;
            }
            const transitionedToPending =
                previousStatus !==
                RefundStatus.PENDING &&
                previousStatus !==
                RefundStatus.PROCESSED &&
                previousStatus !==
                RefundStatus.FAILED &&
                nextStatus ===
                RefundStatus.PENDING;
            const transitionedToProcessed =
                previousStatus !==
                RefundStatus.PROCESSED &&
                nextStatus ===
                RefundStatus.PROCESSED;
            const transitionedToFailed =
                previousStatus !==
                RefundStatus.FAILED &&
                previousStatus !==
                RefundStatus.PROCESSED &&
                nextStatus ===
                RefundStatus.FAILED;
            refundRecord.status =
                nextStatus;
            // =====================================
            // REFUND TIMESTAMPS / FAILURE REASON
            // =====================================
            if (
                nextStatus ===
                RefundStatus.PROCESSED
            ) {
                refundRecord.processedAt =
                    refundRecord.processedAt ||
                    new Date();
                refundRecord.failedAt =
                    undefined;
                refundRecord.failureReason =
                    undefined;
            } else if (
                nextStatus ===
                RefundStatus.FAILED
            ) {
                refundRecord.failedAt =
                    refundRecord.failedAt ||
                    new Date();
                const failureReason =
                    refund?.error_description ||
                    refund?.error_reason ||
                    refund?.error_source ||
                    "Razorpay refund failed";
                refundRecord.failureReason =
                    String(failureReason);
            }
            // =====================================
            // AGGREGATE REFUND MONEY
            // =====================================
            // Update money ONLY on real state
            // transitions so direct API processing
            // + webhook processing cannot double-count.
            if (transitionedToPending) {
                order.pendingRefundAmount =
                    roundMoney(
                        Number(
                            order.pendingRefundAmount ||
                            0,
                        ) +
                        effectiveAmount,
                    );
            }
            if (transitionedToProcessed) {
                order.pendingRefundAmount =
                    clampNonNegative(
                        Number(
                            order.pendingRefundAmount ||
                            0,
                        ) -
                        effectiveAmount,
                    );
                order.refundedAmount =
                    roundMoney(
                        Number(
                            order.refundedAmount ||
                            0,
                        ) +
                        effectiveAmount,
                    );
                order.refundedAt =
                    order.refundedAt ||
                    new Date();
            }
            if (transitionedToFailed) {
                order.pendingRefundAmount =
                    clampNonNegative(
                        Number(
                            order.pendingRefundAmount ||
                            0,
                        ) -
                        effectiveAmount,
                    );
            }
            // =====================================
            // UPDATE PRODUCT-LEVEL REFUND
            // =====================================
            const itemIndex =
                Number(
                    refundRecord.itemIndex,
                );
            if (
                Number.isInteger(itemIndex) &&
                itemIndex >= 0 &&
                itemIndex <
                order.items.length
            ) {
                const item =
                    order.items[
                    itemIndex
                    ] as any;
                item.refundStatus =
                    nextStatus;
                item.refundAmount =
                    effectiveAmount;
                item.refundId =
                    refundId;
                if (
                    nextStatus ===
                    RefundStatus.PROCESSED
                ) {
                    item.refundedAt =
                        item.refundedAt ||
                        new Date();
                }
            }
            // =====================================
            // ORDER-LEVEL REFUND METADATA
            // =====================================
            // Keep refundId as the latest Razorpay
            // refund ID for backward compatibility.
            order.refundId =
                refundId;
            recalculateAggregateRefundStatus(
                order,
            );
            // =====================================
            // EVENT ID
            // =====================================
            if (eventId) {
                const existingIds =
                    Array.isArray(
                        order.refundWebhookEventIds,
                    )
                        ? order.refundWebhookEventIds
                        : [];
                if (
                    !existingIds.includes(
                        eventId,
                    )
                ) {
                    order.refundWebhookEventIds =
                        [
                            ...existingIds,
                            eventId,
                        ];
                }
            }
            // =====================================
            // SAVE
            // =====================================
            await order.save();
            // =====================================
            // CUSTOMER REFUND NOTIFICATION
            // =====================================
            // Notification creation must never make
            // the Razorpay webhook fail after the
            // refund/order state has already been saved.
            if (transitionedToProcessed) {
                try {
                    await NotificationService.create({
                        userId: String(
                            order.user,
                        ),
                        recipientRole:
                            NotificationRecipientRole.CUSTOMER,
                        type:
                            NotificationType.REFUND_PROCESSED,
                        title:
                            "Refund Processed",
                        message:
                            `Your refund of ₹${effectiveAmount.toFixed(
                                2,
                            )} has been processed by Razorpay.`,
                        orderId:
                            order._id,
                    });
                } catch (notificationError) {
                    console.error(
                        "REFUND PROCESSED NOTIFICATION ERROR:",
                        notificationError,
                    );
                }
            }
            if (transitionedToFailed) {
                try {
                    await NotificationService.create({
                        userId: String(
                            order.user,
                        ),
                        recipientRole:
                            NotificationRecipientRole.CUSTOMER,
                        type:
                            NotificationType.REFUND_FAILED,
                        title:
                            "Refund Failed",
                        message:
                            `Your refund of ₹${effectiveAmount.toFixed(
                                2,
                            )} could not be processed. Please check your order details.`,
                        orderId:
                            order._id,
                    });
                } catch (notificationError) {
                    console.error(
                        "REFUND FAILED NOTIFICATION ERROR:",
                        notificationError,
                    );
                }
            }
            console.log(
                "✅ REFUND WEBHOOK PROCESSED:",
                {
                    orderId:
                        order._id.toString(),
                    requestId:
                        refundRecord.requestId,
                    refundId,
                    paymentId,
                    amount:
                        effectiveAmount,
                    previousStatus,
                    status:
                        nextStatus,
                    transitionedToPending,
                    transitionedToProcessed,
                    transitionedToFailed,
                },
            );
            return res.status(200).json({
                success: true,
                message:
                    "Refund webhook processed successfully.",
                data: {
                    orderId: order._id,
                    requestId:
                        refundRecord.requestId,
                    refundId,
                    status:
                        nextStatus,
                    amount:
                        effectiveAmount,
                },
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