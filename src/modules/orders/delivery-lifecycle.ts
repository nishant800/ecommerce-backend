import { OrderStatus, PaymentStatus } from "./order.model.js";

export const isDeliveryPlaced = (status: unknown) =>
    ["pending", "placed", "confirmed", "partially_cancelled"].includes(String(status || "pending").trim().toLowerCase());

export const canProcessDelivery = (order: any) => order.fulfillmentType !== "pickup" &&
    (/^(cod|cash on delivery|cash_on_delivery)$/i.test(String(order.paymentMethod || "").trim()) || order.paymentStatus === PaymentStatus.SUCCESS);

// Also handles eligible historical orders without a bulk migration.
export function startDeliveryProcessing(order: any, now = new Date()) {
    if (!canProcessDelivery(order) || !isDeliveryPlaced(order.orderStatus)) return;
    for (const item of order.items) {
        if (item.quantity <= (item.cancelledQuantity || 0) || !isDeliveryPlaced(item.fulfilmentStatus || order.orderStatus)) continue;
        item.fulfilmentStatus = OrderStatus.PROCESSING;
        item.processingAt = item.processingAt || order.processingAt || now;
    }
    order.processingAt = order.processingAt || now;
    if (order.orderStatus !== OrderStatus.PARTIALLY_CANCELLED) order.orderStatus = OrderStatus.PROCESSING;
}
