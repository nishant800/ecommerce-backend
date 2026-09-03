import razorpay from "./razorpay.js";
import Order, {
    OrderStatus,
    PaymentStatus,
} from "../orders/order.model.js";
import crypto from "crypto";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";

export class PaymentService {
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

        console.log("Found order:", order);

        if (!order) {
            throw new Error("Order not found");
        }

        if (order.paymentStatus === PaymentStatus.SUCCESS) {
            throw new Error("Order already paid");
        }

        if (order.orderStatus === OrderStatus.CANCELLED) {
            throw new Error(
                "Cancelled orders cannot be paid."
            );
        }

        try {
            const razorpayOrder =
                await razorpay.orders.create({
                    amount: Math.round(order.total * 100),
                    currency: "INR",
                    receipt: order._id.toString(),
                });

            order.razorpayOrderId =
                razorpayOrder.id;

            await order.save();

            console.log(
                "Razorpay Order Created:",
                razorpayOrder.id
            );

            return {
                order,
                razorpayOrder,
                keyId: process.env.RAZORPAY_KEY_ID,
            };
        } catch (err) {
            console.error(
                "RAZORPAY ERROR:",
                err
            );

            throw err;
        }
    }

    static async verifyPayment(data: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
    }, userId: string) {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = data;

        // =====================================
        // VERIFY RAZORPAY SIGNATURE
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
        // FIND ORDER BELONGING TO USER
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
        // ALREADY PAID
        // =====================================

        if (
            order.paymentStatus ===
            PaymentStatus.SUCCESS
        ) {
            throw new Error(
                "Payment already verified"
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

        // Reduce Product Stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(
                item.product,
                {
                    $inc: {
                        stock: -item.quantity,
                    },
                }
            );
        }

        // Clear Cart
        await Cart.findOneAndUpdate(
            { user: order.user },
            {
                items: [],
            }
        );

        return order;
    }

    // =========================================
    // CREATE RAZORPAY REFUND
    // =========================================

    static async refundPayment(
        orderId: string,
        razorpayPaymentId: string,
        amount: number,
    ) {
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

        const keyId =
            process.env.RAZORPAY_KEY_ID;

        const keySecret =
            process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            throw new Error(
                "Razorpay credentials are not configured."
            );
        }

        const refundAmount =
            Math.round(amount * 100);

        // Stable idempotency key for this order.
        // Retrying the same refund request will not
        // create a duplicate refund at Razorpay.
        const idempotencyKey =
            `refund_${orderId}`;

        const authorization =
            Buffer.from(
                `${keyId}:${keySecret}`,
            ).toString("base64");

        const response = await fetch(
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
                    "X-Refund-Idempotency":
                        idempotencyKey,
                },
                body: JSON.stringify({
                    amount: refundAmount,
                    speed: "normal",
                    receipt:
                        `refund-${orderId}`,
                    notes: {
                        order_id:
                            String(orderId),
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

            throw new Error(
                data?.error?.description ||
                "Unable to process Razorpay refund."
            );
        }

        console.log(
            "✅ RAZORPAY REFUND:",
            data,
        );

        return data;
    }
}
