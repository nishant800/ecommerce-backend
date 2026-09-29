import razorpay from "./razorpay.js";
import Order, {
    OrderStatus,
    PaymentStatus,
} from "../orders/order.model.js";
import crypto from "crypto";
import Cart from "../cart/cart.model.js";
export class PaymentService {
    // =========================================
    // CREATE RAZORPAY ORDER
    // =========================================
    static async createPayment(
        orderId: string,
        userId: string
    ) {
        console.log("================================");
        console.log("Received orderId:", orderId);
        console.log("Received userId:", userId);
        const order = await Order.findOne({
            _id: orderId,
            user: userId,
        });
        console.log("Found order:", order?._id?.toString());
        if (!order) {
            throw new Error("Order not found");
        }
        if (order.paymentStatus === PaymentStatus.SUCCESS) {
            throw new Error("Order already paid");
        }
        if (
            order.orderStatus === OrderStatus.CANCELLED ||
            order.orderStatus === OrderStatus.PARTIALLY_CANCELLED
        ) {
            throw new Error(
                "Cancelled orders cannot be paid."
            );
        }
        if (!Number.isFinite(Number(order.total)) || Number(order.total) <= 0) {
            throw new Error("Invalid order amount.");
        }
        try {
            const razorpayOrder =
                await razorpay.orders.create({
                    amount: Math.round(
                        Number(order.total) * 100
                    ),
                    currency: "INR",
                    receipt: order._id.toString(),
                });
            order.razorpayOrderId =
                razorpayOrder.id;
            await order.save();
            console.log(
                "✅ Razorpay Order Created:",
                razorpayOrder.id
            );
            return {
                order,
                razorpayOrder,
                keyId: process.env.RAZORPAY_KEY_ID,
            };
        } catch (err) {
            console.error(
                "RAZORPAY CREATE ORDER ERROR:",
                err
            );
            throw err;
        }
    }
    // =========================================
    // VERIFY RAZORPAY PAYMENT
    // =========================================
    static async verifyPayment(
        data: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
        },
        userId: string
    ) {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = data;
        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            throw new Error(
                "Incomplete Razorpay payment verification data."
            );
        }
        // =====================================
        // VERIFY SIGNATURE
        // =====================================
        const generatedSignature = crypto
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET!
            )
            .update(
                `${razorpay_order_id}|${razorpay_payment_id}`
            )
            .digest("hex");
        if (
            generatedSignature !==
            razorpay_signature
        ) {
            throw new Error(
                "Invalid payment signature"
            );
        }
        // =====================================
        // FIND LOCAL ORDER
        // =====================================
        const order = await Order.findOne({
            razorpayOrderId:
                razorpay_order_id,
            user: userId,
        });
        if (!order) {
            throw new Error("Order not found");
        }
        // =====================================
        // IDEMPOTENT SUCCESS
        // =====================================
        if (
            order.paymentStatus ===
            PaymentStatus.SUCCESS
        ) {
            // The signature was already verified above.
            // Returning the existing paid order makes
            // safe client retries possible.
            return order;
        }
        // =====================================
        // VERIFY PAYMENT WITH RAZORPAY
        // =====================================
        //
        // Signature validation proves the callback was
        // generated for these IDs, while fetching the
        // payment lets the backend verify the actual
        // payment/order relationship and captured amount.
        // =====================================
        const razorpayPayment =
            await razorpay.payments.fetch(
                razorpay_payment_id
            );
        if (!razorpayPayment) {
            throw new Error(
                "Razorpay payment could not be found."
            );
        }
        if (
            String(
                razorpayPayment.order_id || ""
            ) !==
            String(razorpay_order_id)
        ) {
            throw new Error(
                "Razorpay payment does not belong to this order."
            );
        }
        if (
            String(
                razorpayPayment.status || ""
            ).toLowerCase() !== "captured"
        ) {
            throw new Error(
                `Payment is not captured. Current Razorpay status: ${razorpayPayment.status || "unknown"}`
            );
        }
        const expectedAmountPaise =
            Math.round(
                Number(order.total) * 100
            );
        const actualAmountPaise =
            Number(
                razorpayPayment.amount
            );
        if (
            !Number.isFinite(actualAmountPaise) ||
            actualAmountPaise !==
            expectedAmountPaise
        ) {
            throw new Error(
                "Razorpay payment amount does not match the order amount."
            );
        }
        if (
            String(
                razorpayPayment.currency || ""
            ).toUpperCase() !== "INR"
        ) {
            throw new Error(
                "Unexpected payment currency."
            );
        }
        // =====================================
        // UPDATE ORDER
        // =====================================
        order.paymentStatus =
            PaymentStatus.SUCCESS;
        order.razorpayPaymentId =
            razorpay_payment_id;
        order.razorpaySignature =
            razorpay_signature;
        await order.save();
        // =====================================
        // CLEAR CART
        // =====================================
        await Cart.findOneAndUpdate(
            { user: order.user },
            {
                items: [],
            }
        );
        // =====================================
        // RECONCILE CANCELLED PAID ORDER
        // =====================================
        //
        // If the customer cancelled while the
        // payment was still pending, payment has
        // now become successful and the missing
        // refund must be created.
        //
        // Dynamic import avoids a circular static
        // dependency because OrderService already
        // imports PaymentService.
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
            // Payment is already successfully saved.
            // Do not turn a successful payment into
            // a client-side verification failure.
            //
            // The payment webhook provides another
            // reconciliation opportunity.
            console.error(
                "PAYMENT VERIFY CANCELLATION RECONCILIATION ERROR:",
                reconcileError,
            );
        }
        console.log(
            "✅ PAYMENT VERIFIED:",
            {
                orderId:
                    order._id.toString(),
                paymentId:
                    razorpay_payment_id,
                amount:
                    Number(order.total),
            }
        );
        return order;
    }
    // =========================================
    // CREATE RAZORPAY REFUND
    // =========================================
    //
    // refundRequestId is intentionally used as the
    // Razorpay receipt value. Razorpay requires the
    // receipt to be unique for refund requests on a
    // payment, so this becomes our refund-level
    // idempotency/reference key.
    // =========================================
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
