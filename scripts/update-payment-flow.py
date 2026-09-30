from pathlib import Path
import re
root = Path(__file__).resolve().parents[2]
def edit(name, fn):
    p = root / name
    text = p.read_text(encoding='utf-8')
    p.write_text(fn(text), encoding='utf-8')

def payment(s):
    s = 'import mongoose from "mongoose";\nimport { confirmCapturedPayment, releaseSellerNotifications } from "./payment-lifecycle.js";\nimport { retryDeadline, onlineMethods } from "../orders/payment-retry.js";\n' + s
    start = s.index('    static async notifySellersForConfirmedOrder(')
    end = s.index('    static async refundPayment(')
    s = s[:start] + '''    static notifySellersForConfirmedOrder = releaseSellerNotifications;

    static async createPayment(orderId: string, userId: string) {
        if (!mongoose.isValidObjectId(orderId)) throw new Error("Invalid order ID");
        const { OrderService } = await import("../orders/order.service.js");
        await OrderService.expirePaymentOrder(orderId);
        const now = new Date();
        const order = await Order.findOneAndUpdate({ _id: orderId, user: userId,
            paymentMethod: onlineMethods, paymentRetryEnabled: true,
            paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
            orderStatus: { $in: [OrderStatus.PENDING, OrderStatus.PARTIALLY_CANCELLED] },
            sellerReleasedAt: null,
            $or: [{ paymentCreationLockUntil: null }, { paymentCreationLockUntil: { $lte: now } }],
        }, { $set: { paymentCreationLockUntil: new Date(now.getTime() + 60_000) } }, { new: true });
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
            if (!["created", "attempted"].includes(gateway.status)) throw new Error("Payment confirmation pending. Refresh your order.");
            const updated = await Order.findOneAndUpdate({ _id: order._id,
                paymentStatus: order.paymentStatus, paymentRetryEnabled: true, sellerReleasedAt: null,
                orderStatus: { $in: [OrderStatus.PENDING, OrderStatus.PARTIALLY_CANCELLED] },
            }, { $set: { razorpayOrderId: gateway.id, paymentStatus: PaymentStatus.PENDING },
                $inc: { paymentAttemptCount: isRetry ? 1 : 0, __v: 1 } }, { new: true });
            if (!updated) throw new Error("Order changed. Refresh before paying.");
            return { order: updated, razorpayOrder: gateway, keyId: process.env.RAZORPAY_KEY_ID, isRetry, serverTime: new Date().toISOString() };
        } finally { await Order.updateOne({ _id: order._id }, { $set: { paymentCreationLockUntil: null } }); }
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

''' + s[end:]
    return s
edit('backend/src/modules/payment/payment.service.ts', payment)

def webhook(s):
    s = 'import { confirmCapturedPayment, recordPaymentFailure } from "./payment-lifecycle.js";\n' + s
    start = s.index('                const eventFilter =')
    end = s.index('            const refund =', start)
    s = s[:start] + '''                const stableEventId = eventId || crypto.createHash("sha256").update(rawBody).digest("hex");
                if (event === "payment.captured") {
                    if (payment.status !== "captured" || payment.currency !== "INR" || Number(payment.amount) !== Math.round(order.total * 100)) {
                        return res.status(400).json({ success: false, message: "Payment does not match order" });
                    }
                    await confirmCapturedPayment(String(order._id), paymentId, stableEventId);
                } else {
                    await recordPaymentFailure(String(order._id), stableEventId);
                }
                return res.json({ success: true });
            }

''' + s[end:]
    return s
edit('backend/src/modules/payment/payment.webhook.controller.ts', webhook)

def controller(s):
    s = 'import { releaseSellerNotifications } from "../payment/payment-lifecycle.js";\n' + s
    s = s.replace('        const isCodPayment =', '        if (!["cod", "online", "razorpay"].includes(normalizedPaymentMethod)) throw new Error("Invalid payment method");\n        const isCodPayment =')
    s = s.replace('                        paymentStatus:\n                            "pending",', '                        paymentStatus:\n                            "pending",\n                        paymentRetryEnabled: !isCodPayment,')
    a=s.index('                const sellerIds =', s.index('if (isCodPayment)'))
    b=s.index('\n            }\n        } catch', a)
    s=s[:a]+'                await releaseSellerNotifications(String(order._id));'+s[b:]
    s=re.sub(r'(return res(?:\.status\([^\n]+\))?\.json\(\{)', r'\1\n            serverTime: new Date().toISOString(),', s)
    return s
edit('backend/src/modules/orders/order.controller.ts', controller)
edit('backend/src/modules/payment/payment.controller.ts', lambda s: s.replace('success: true,', 'success: true,\n                serverTime: new Date().toISOString(),'))
edit('backend/src/server.ts', lambda s: 'import { OrderService } from "./modules/orders/order.service.js";\n'+s.replace("app.listen(PORT, '0.0.0.0', () => {", "app.listen(PORT, '0.0.0.0', () => {\n        OrderService.startPaymentRetryExpiryScheduler();"))
edit('backend/src/modules/orders/order.service.ts', lambda s: s.replace('            cancelledOrder = order;', '''            if (order.orderStatus === OrderStatus.CANCELLED) {
                order.paymentRetryEnabled = false;
                order.set("paymentRetryExpiresAt", null);
            }
            cancelledOrder = order;''').replace('        return await Order.findOne({\n            _id: orderId,\n            user: userId,\n        })', '        if (!mongoose.isValidObjectId(orderId)) throw new Error("Invalid order ID");\n        return await Order.findOne({\n            _id: orderId,\n            user: userId,\n        })'))
