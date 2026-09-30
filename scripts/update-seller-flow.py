from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
p=root/'backend/src/modules/seller/seller.service.ts'
s=p.read_text(encoding='utf-8')
s='import { OrderService } from "../orders/order.service.js";\nimport { EarningService } from "../payout/earning.service.js";\nimport { OrderStatus, PaymentStatus } from "../orders/order.model.js";\n'+s
s=s.replace('            sellerReleasedAt: {\n                $ne: null,\n            },', '            sellerReleasedAt: {\n                $ne: null,\n            },\n            paymentStatus: "success",')
# Restrict output while retaining global item index for replacements.
pos=s.index('export class SellerService')
s=s[:pos]+'''const sellerOrderView = (order: any, seller: string) => {
    if (!order) return null;
    const value = typeof order.toJSON === "function" ? order.toJSON() : order;
    value.items = value.items.map((item: any, index: number) => ({ ...item, orderItemIndex: index }))
        .filter((item: any) => String(item.seller?._id || item.seller) === seller);
    value.subtotal = value.items.reduce((total: number, item: any) => total + item.price * Math.max(0, item.quantity - (item.cancelledQuantity || 0)), 0);
    value.total = value.subtotal;
    value.shippingCharge = 0;
    value.tax = 0;
    value.discount = value.items.reduce((total: number, item: any) => total + Math.max(0, (item.basePrice || item.price) - item.price) * Math.max(0, item.quantity - (item.cancelledQuantity || 0)), 0);
    delete value.refunds;
    delete value.refundedAmount;
    delete value.pendingRefundAmount;
    delete value.razorpaySignature;
    return value;
};

''' +s[pos:]
# Correct aggregate quantity calculations.
s=s.replace('"$items.quantity",', '{ $max: [0, { $subtract: ["$items.quantity", { $ifNull: ["$items.cancelledQuantity", 0] }] }] },')
s=s.replace('            totalProfit,', '            totalProfit,\n            payments: await EarningService.summary(sellerId),')
# Attach projection to the two read methods.
a=s.index('    static async getOrders('); b=s.index('    static async updateOrderStatus(',a)
part=s[a:b]
part=part.replace('"name phone business"\n\n            );', '"name phone business"\n\n            ).then(result => Array.isArray(result) ? result.map(order => sellerOrderView(order, sellerId)) : sellerOrderView(result, sellerId));')
part=part.replace('        const sellerObjectId =', '        if (!mongoose.isValidObjectId(sellerId)) throw new Error("Invalid seller ID");\n        const sellerObjectId =')
part=part.replace('        return await Order.findOne({', '        if (!mongoose.isValidObjectId(orderId)) throw new Error("Invalid order ID");\n        return await Order.findOne({')
s=s[:a]+part+s[b:]
a=s.index('    static async updateOrderStatus(')
b=s.index('    static async getProfile(',a)
s=s[:a]+'''    static async updateOrderStatus(sellerId: string, orderId: string, status: string) {
        if (!mongoose.isValidObjectId(orderId)) throw new Error("Invalid order ID");
        if (!["shipped", "delivered", "cancelled"].includes(status)) throw new Error("Invalid order transition");
        const order = await Order.findOne({ _id: orderId, "items.seller": sellerId, ...sellerVisibleOrderFilter() });
        if (!order) return null;
        if (status === "cancelled") {
            // Reuse customer cancellation's transactional quantity restoration and refund reconciliation.
            for (let index = 0; index < order.items.length; index++) {
                const item = order.items[index];
                if (String(item.seller) === sellerId && item.quantity > item.cancelledQuantity) {
                    await OrderService.cancelOrderItem(String(order.user), orderId, index);
                }
            }
        } else {
            const session = await mongoose.startSession();
            try { await session.withTransaction(async () => {
                const current = await Order.findOne({ _id: orderId, "items.seller": sellerId, ...sellerVisibleOrderFilter() }).session(session);
                if (!current || current.orderStatus === OrderStatus.CANCELLED) throw new Error("Order is unavailable");
                const items = current.items.filter(i => String(i.seller) === sellerId && i.quantity > i.cancelledQuantity);
                if (!items.length) throw new Error("No active seller items");
                for (const item of items) {
                    const previous = item.fulfilmentStatus || current.orderStatus;
                    if (previous === status) continue;
                    if ((status === "shipped" && previous !== "pending") || (status === "delivered" && previous !== "shipped")) throw new Error("Invalid order transition");
                    item.fulfilmentStatus = status;
                    if (status === "delivered") item.deliveredAt = new Date();
                }
                const active = current.items.filter(i => i.quantity > i.cancelledQuantity);
                if (active.every(i => i.fulfilmentStatus === "delivered")) {
                    current.orderStatus = OrderStatus.DELIVERED;
                    current.deliveredAt = current.deliveredAt || new Date();
                    if (/^cod$/i.test(current.paymentMethod)) current.paymentStatus = PaymentStatus.SUCCESS;
                } else { current.orderStatus = OrderStatus.SHIPPED; current.shippedAt = current.shippedAt || new Date(); }
                await current.save({ session });
                await NotificationService.enqueue({ userId: current.user, type: status === "shipped" ? NotificationType.ORDER_SHIPPED : NotificationType.ORDER_DELIVERED,
                    title: status === "shipped" ? "Order Shipped" : "Order Delivered", message: `Your items from this seller have been ${status}.`,
                    orderId: current._id, dedupeKey: `seller-order-status:${orderId}:${sellerId}:${status}` }, session);
            }); } finally { await session.endSession(); }
        }
        await EarningService.reconcileOrder(orderId);
        return this.getOrder(sellerId, orderId);
    }

    static async markOrderShippedAfterLabel(sellerId: string, orderId: string) {
        const order = await this.updateOrderStatus(sellerId, orderId, "shipped");
        if (order) await Order.updateOne({ _id: orderId, "items.seller": sellerId, ...sellerVisibleOrderFilter() },
            { $set: { shippingLabelGeneratedAt: new Date() } });
        return order;
    }

''' +s[b:]
p.write_text(s,encoding='utf-8')
# Wire synchronous ledger updates after committed cancellation/refund changes.
p=root/'backend/src/modules/orders/order.service.ts';s=p.read_text(encoding='utf-8')
s='import { EarningService } from "../payout/earning.service.js";\n'+s
s=s.replace('        if (refundRequest) {\n            try {', '        await EarningService.reconcileOrder(orderId);\n        if (refundRequest) {\n            try {')
p.write_text(s,encoding='utf-8')
p=root/'backend/src/modules/payment/payment.webhook.controller.ts';s=p.read_text(encoding='utf-8')
s='import { EarningService } from "../payout/earning.service.js";\n'+s
s=s.replace('await order.save();','await order.save();\n            await EarningService.reconcileOrder(String(order._id));')
p.write_text(s,encoding='utf-8')
