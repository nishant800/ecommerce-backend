import mongoose from "mongoose";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";
import Address from "../address/address.model.js";
import Order, {
    OrderStatus,
    PaymentStatus,
    RefundStatus,
} from "./order.model.js";
import {
    NotificationService,
} from "../../notifications/notification.service.js";
import {
    NotificationType,
} from "../../notifications/notification.model.js";
import {
    PaymentService,
} from "../payment/payment.service.js"; const recalculateVariantStock = (
    variant: any,
) => {
    if (
        Array.isArray(variant?.sizes) &&
        variant.sizes.length > 0
    ) {
        return variant.sizes.reduce(
            (total: number, entry: any) =>
                total +
                Number(entry.stock || 0),
            0,
        );
    }
    if (
        Array.isArray(variant?.shades) &&
        variant.shades.length > 0
    ) {
        return variant.shades.reduce(
            (total: number, entry: any) =>
                total +
                Number(entry.stock || 0),
            0,
        );
    }
    if (
        Array.isArray(variant?.colors) &&
        variant.colors.length > 0
    ) {
        return variant.colors.reduce(
            (total: number, entry: any) =>
                total +
                Number(entry.stock || 0),
            0,
        );
    }
    return Number(
        variant?.stock || 0
    );
};
// =========================================
// REFUND / CANCELLATION HELPERS
// =========================================
const roundMoney = (value: number) =>
    Math.round((Number(value) || 0) * 100) / 100;
const isRazorpayPaid = (order: any) => {
    const paymentMethod = String(
        order?.paymentMethod || "",
    )
        .trim()
        .toLowerCase();

    return (
        (
            paymentMethod === "razorpay" ||
            paymentMethod === "online"
        ) &&
        order?.paymentStatus === PaymentStatus.SUCCESS &&
        Boolean(order?.razorpayPaymentId)
    );
};
const recalculateAggregateRefundStatus = (order: any) => {
    const refunds = Array.isArray(order?.refunds)
        ? order.refunds
        : [];
    if (refunds.some((refund: any) =>
        refund.status === RefundStatus.PENDING
    )) {
        return RefundStatus.PENDING;
    }
    if (refunds.some((refund: any) =>
        refund.status === RefundStatus.FAILED
    )) {
        return RefundStatus.FAILED;
    }
    if (refunds.some((refund: any) =>
        refund.status === RefundStatus.PROCESSED
    )) {
        return RefundStatus.PROCESSED;
    }
    return RefundStatus.NONE;
};
const restoreStockForItem = async (
    product: any,
    item: any,
    session: mongoose.ClientSession,
) => {
    const quantity = Number(item?.quantity) || 0;
    if (quantity <= 0) {
        throw new Error("Invalid order item quantity.");
    }
    if (item?.variant?.sku) {
        const selectedVariant =
            product.variants?.find(
                (variant: any) =>
                    String(variant?.sku || "") ===
                    String(item.variant.sku),
            );
        if (!selectedVariant) {
            throw new Error(
                `Variant ${item.variant.sku} was not found for ${product.name}. Stock cannot be restored safely.`,
            );
        }
        const optionType = String(
            item.variant?.optionType || "",
        )
            .trim()
            .toLowerCase();
        const optionValue = String(
            item.variant?.optionValue || "",
        ).trim();
        if (
            optionType === "size" &&
            optionValue &&
            Array.isArray(selectedVariant.sizes) &&
            selectedVariant.sizes.length > 0
        ) {
            const option = selectedVariant.sizes.find(
                (entry: any) =>
                    String(entry?.size || "")
                        .trim()
                        .toLowerCase() ===
                    optionValue.toLowerCase(),
            );
            if (!option) {
                throw new Error(
                    `Selected size ${optionValue} was not found for ${product.name}. Stock cannot be restored safely.`,
                );
            }
            option.stock =
                Number(option.stock || 0) + quantity;
            selectedVariant.stock =
                recalculateVariantStock(selectedVariant);
        }
        else if (
            optionType === "shade" &&
            optionValue &&
            Array.isArray(selectedVariant.shades) &&
            selectedVariant.shades.length > 0
        ) {
            const option = selectedVariant.shades.find(
                (entry: any) =>
                    String(entry?.shade || "")
                        .trim()
                        .toLowerCase() ===
                    optionValue.toLowerCase(),
            );
            if (!option) {
                throw new Error(
                    `Selected shade ${optionValue} was not found for ${product.name}. Stock cannot be restored safely.`,
                );
            }
            option.stock =
                Number(option.stock || 0) + quantity;
            selectedVariant.stock =
                recalculateVariantStock(selectedVariant);
        }
        else if (
            optionType === "color" &&
            optionValue &&
            Array.isArray(selectedVariant.colors) &&
            selectedVariant.colors.length > 0
        ) {
            const option = selectedVariant.colors.find(
                (entry: any) =>
                    String(entry?.color || "")
                        .trim()
                        .toLowerCase() ===
                    optionValue.toLowerCase(),
            );
            if (!option) {
                throw new Error(
                    `Selected color ${optionValue} was not found for ${product.name}. Stock cannot be restored safely.`,
                );
            }
            option.stock =
                Number(option.stock || 0) + quantity;
            selectedVariant.stock =
                recalculateVariantStock(selectedVariant);
        }
        else {
            selectedVariant.stock =
                Number(selectedVariant.stock || 0) + quantity;
        }
    }
    else {
        product.stock =
            Number(product.stock || 0) + quantity;
    }
    await product.save({ session });
};
const processRefundResponse = async (
    orderId: string,
    itemIndex: number,
    refundRequestId: string,
    refundResponse: any,
) => {
    const order = await Order.findById(orderId);
    if (!order) {
        return;
    }
    const refundRecord =
        order.refunds?.find(
            (refund: any) =>
                refund.requestId === refundRequestId,
        );
    if (!refundRecord) {
        console.error(
            "Refund record not found:",
            refundRequestId,
        );
        return;
    }
    const amount = roundMoney(
        Number(refundRecord.amount || 0),
    );
    const razorpayStatus = String(
        refundResponse?.status || "pending",
    )
        .trim()
        .toLowerCase();
    const finalStatus =
        razorpayStatus === "processed"
            ? RefundStatus.PROCESSED
            : razorpayStatus === "failed"
                ? RefundStatus.FAILED
                : RefundStatus.PENDING;
    const previousStatus =
        refundRecord.status;
    refundRecord.status = finalStatus;
    if (refundResponse?.id) {
        refundRecord.razorpayRefundId =
            String(refundResponse.id);
    }
    if (finalStatus === RefundStatus.PROCESSED) {
        refundRecord.processedAt =
            refundRecord.processedAt || new Date();
        if (previousStatus !== RefundStatus.PROCESSED) {
            order.pendingRefundAmount =
                Math.max(
                    0,
                    roundMoney(
                        Number(order.pendingRefundAmount || 0) -
                        amount,
                    ),
                );
            order.refundedAmount =
                roundMoney(
                    Number(order.refundedAmount || 0) + amount,
                );
        }
    }
    if (finalStatus === RefundStatus.FAILED) {
        refundRecord.failedAt =
            refundRecord.failedAt || new Date();
        refundRecord.failureReason =
            refundResponse?.error?.description ||
            refundResponse?.message ||
            "Razorpay refund failed.";
        if (previousStatus === RefundStatus.PENDING) {
            order.pendingRefundAmount =
                Math.max(
                    0,
                    roundMoney(
                        Number(order.pendingRefundAmount || 0) -
                        amount,
                    ),
                );
        }
    }
    const item =
        itemIndex >= 0
            ? order.items[itemIndex]
            : null;
    if (item) {
        item.refundStatus = finalStatus;
        item.refundAmount = amount;
        if (refundResponse?.id) {
            item.refundId =
                String(refundResponse.id);
        }
        if (finalStatus === RefundStatus.PROCESSED) {
            item.refundedAt =
                item.refundedAt || new Date();
        }
    }
    order.refundStatus =
        recalculateAggregateRefundStatus(order);
    if (refundResponse?.id) {
        order.refundId =
            String(refundResponse.id);
    }
    if (finalStatus === RefundStatus.PROCESSED) {
        order.refundedAt =
            order.refundedAt || new Date();
    }
    await order.save();
};
const markRefundFailed = async (
    orderId: string,
    itemIndex: number,
    refundRequestId: string,
    error: any,
) => {
    const order = await Order.findById(orderId);
    if (!order) {
        return;
    }
    const refundRecord =
        order.refunds?.find(
            (refund: any) =>
                refund.requestId === refundRequestId,
        );
    if (!refundRecord) {
        return;
    }
    const amount = roundMoney(
        Number(refundRecord.amount || 0),
    );
    if (refundRecord.status === RefundStatus.PENDING) {
        order.pendingRefundAmount =
            Math.max(
                0,
                roundMoney(
                    Number(order.pendingRefundAmount || 0) -
                    amount,
                ),
            );
    }
    refundRecord.status = RefundStatus.FAILED;
    refundRecord.failedAt = new Date();
    refundRecord.failureReason =
        error?.message ||
        "Unable to process Razorpay refund.";
    const item =
        itemIndex >= 0
            ? order.items[itemIndex]
            : null;
    if (item) {
        item.refundStatus = RefundStatus.FAILED;
    }
    order.refundStatus =
        RefundStatus.FAILED;
    await order.save();
};
export class OrderService {
    // =========================================
    // CREATE ORDER
    // =========================================
    static async createOrder(
        userId: string,
        addressId: string
    ) {
        // =====================================
        // GET CART
        // =====================================
        const cart =
            await Cart.findOne({
                user: userId,
            });
        if (
            !cart ||
            cart.items.length === 0
        ) {
            throw new Error(
                "Cart is empty"
            );
        }
        // =====================================
        // GET ADDRESS
        // =====================================
        const address =
            await Address.findOne({
                _id: addressId,
                user: userId,
            });
        if (!address) {
            throw new Error(
                "Address not found"
            );
        }
        // =====================================
        // ORDER ITEMS
        // =====================================
        const orderItems: any[] = [];
        let subtotal = 0;
        let totalBasePrice = 0;
        let totalDiscountPrice = 0;
        // =====================================
        // PROCESS CART ITEMS
        // =====================================
        for (
            const item of cart.items
        ) {
            const product =
                await Product.findById(
                    item.product
                );
            if (!product) {
                throw new Error(
                    "Product not found"
                );
            }
            // =================================
            // STOCK
            // =================================
            if (
                product.stock <
                item.quantity
            ) {
                throw new Error(
                    `${product.name} is out of stock`
                );
            }
            // =================================
            // PRICE
            //
            // price = MRP
            // discountPrice = selling price
            //
            // IMPORTANT:
            // A value of 0 or a missing
            // discountPrice means there is
            // no discount, so selling price
            // must fall back to MRP.
            // =================================
            const basePrice =
                Number(
                    product.price || 0
                );
            const storedDiscountPrice =
                Number(
                    product.discountPrice
                );
            const finalPrice =
                storedDiscountPrice > 0
                    ? storedDiscountPrice
                    : basePrice;
            // =================================
            // TOTAL PRICE
            // =================================
            totalBasePrice +=
                basePrice *
                item.quantity;
            totalDiscountPrice +=
                finalPrice *
                item.quantity;
            subtotal +=
                finalPrice *
                item.quantity;
            // =================================
            // ORDER ITEM
            //
            // IMPORTANT:
            // Cart ICartItem does NOT contain
            // a variant property.
            //
            // Therefore this service does
            // NOT access item.variant.
            //
            // Variant/SKU handling belongs to
            // the existing order controller
            // checkout flow.
            // =================================
            orderItems.push({
                product:
                    product._id,
                seller:
                    product.seller,
                name:
                    product.name,
                image:
                    product.thumbnail,
                // MRP
                basePrice:
                    basePrice,
                // Final selling price
                discountPrice:
                    finalPrice,
                // Final unit price
                price:
                    finalPrice,
                quantity:
                    item.quantity,
            });
        }
        // =====================================
        // DISCOUNT
        // =====================================
        const discount =
            Math.max(
                0,
                totalBasePrice -
                totalDiscountPrice
            );
        // =====================================
        // DELIVERY CHARGE
        // =====================================
        const shippingCharge =
            subtotal < 500
                ? 30
                : 0;
        // =====================================
        // TAX
        //
        // Tax must be determined from the
        // applicable product/tax configuration.
        //
        // This service does not currently have
        // a product tax-rate field available in
        // the supplied Product model/type.
        //
        // Therefore do NOT hard-code 18%.
        // Keep it at 0 until the backend product
        // tax configuration is implemented.
        // =====================================
        const tax = 0;
        // =====================================
        // FINAL TOTAL
        // =====================================
        const total =
            subtotal +
            shippingCharge +
            tax;
        // =====================================
        // CREATE ORDER
        // =====================================
        const order =
            await Order.create({
                user:
                    userId,
                items:
                    orderItems,
                shippingAddress: {
                    // =================================
                    // RECEIVER
                    // =================================
                    fullName:
                        address.fullName,
                    phone:
                        address.phone,
                    // =================================
                    // WRITTEN ADDRESS
                    // =================================
                    pincode:
                        address.pincode,
                    house:
                        address.house,
                    street:
                        address.street || "",
                    area:
                        address.area,
                    landmark:
                        address.landmark || "",
                    city:
                        address.city,
                    state:
                        address.state,
                    country:
                        address.country || "India",
                    // =================================
                    // ADDRESS TYPE
                    // =================================
                    type:
                        address.type,
                    // =================================
                    // DELIVERY LOCATION SNAPSHOT
                    // =================================
                    location:
                        address.location
                            ? {
                                type: "Point",
                                coordinates: [
                                    address.location
                                        .coordinates[0],
                                    address.location
                                        .coordinates[1],
                                ],
                            }
                            : undefined,
                },
                subtotal,
                shippingCharge,
                discount,
                tax,
                total,
                paymentMethod:
                    "Razorpay",
            });
        return order;
    }
    // =========================================
    // GET MY ORDERS
    // =========================================
    static async getMyOrders(
        userId: string
    ) {
        return await Order.find({
            user: userId,
        }).sort({
            createdAt: -1,
        });
    }
    // =========================================
    // GET ORDER DETAILS
    // =========================================
    static async getOrder(
        userId: string,
        orderId: string
    ) {
        return await Order.findOne({
            _id: orderId,
            user: userId,
        })
            // =====================================
            // CUSTOMER DETAILS
            // =====================================
            // Get the customer directly from Users.
            .populate(
                "user",
                "name email phone profileImage"
            )
            // =====================================
            // SELLER DETAILS
            // =====================================
            // Get seller/shop details directly from Users.
            // This includes business address, GSTIN and shop phone.
            .populate(
                "items.seller",
                "name email phone business"
            )
            // =====================================
            // PRODUCT DETAILS
            // =====================================
            // Get product name/image directly from Products.
            .populate(
                "items.product",
                "name thumbnail"
            );
    }
    // =========================================
    // CANCEL ONE PRODUCT / ORDER ITEM
    // =========================================
    static async cancelOrderItem(
        userId: string,
        orderId: string,
        itemIndex: number,
    ) {
        if (!Number.isInteger(itemIndex)) {
            throw new Error("Invalid order item.");
        }
        const session =
            await mongoose.startSession();
        let cancelledOrder: any = null;
        let refundRequest: {
            requestId: string;
            amount: number;
            itemIndex: number;
        } | null = null;
        try {
            session.startTransaction();
            const order =
                await Order.findOne({
                    _id: orderId,
                    user: userId,
                }).session(session);
            if (!order) {
                throw new Error("Order not found");
            }
            if (
                order.orderStatus !== OrderStatus.PENDING &&
                order.orderStatus !== OrderStatus.PARTIALLY_CANCELLED
            ) {
                throw new Error(
                    "Products can only be cancelled while the order is pending."
                );
            }
            if (
                itemIndex < 0 ||
                itemIndex >= order.items.length
            ) {
                throw new Error("Order item not found.");
            }
            const item: any =
                order.items[itemIndex];
            const orderedQuantity =
                Number(item.quantity) || 0;
            const cancelledQuantity =
                Number(item.cancelledQuantity || 0);
            const remainingQuantity =
                orderedQuantity - cancelledQuantity;
            if (remainingQuantity <= 0) {
                throw new Error(
                    "This product has already been cancelled."
                );
            }
            const product =
                await Product.findById(
                    item.product
                ).session(session);
            if (!product) {
                throw new Error(
                    "The product no longer exists, so stock could not be restored safely."
                );
            }
            await restoreStockForItem(
                product,
                {
                    ...item.toObject(),
                    quantity: remainingQuantity,
                },
                session,
            );
            item.cancelledQuantity =
                orderedQuantity;
            item.cancelledAt =
                new Date();
            const allItemsCancelled =
                order.items.every(
                    (entry: any) =>
                        Number(entry.cancelledQuantity || 0) >=
                        Number(entry.quantity || 0)
                );
            const lineRefundAmount =
                roundMoney(
                    Number(item.price || 0) *
                    remainingQuantity
                );
            const alreadyRefunded =
                roundMoney(
                    Number(order.refundedAmount || 0)
                );
            const pendingRefund =
                roundMoney(
                    Number(order.pendingRefundAmount || 0)
                );
            const remainingRefundableAmount =
                Math.max(
                    0,
                    roundMoney(
                        Number(order.total || 0) -
                        alreadyRefunded -
                        pendingRefund
                    )
                );
            const refundAmount = allItemsCancelled
                ? remainingRefundableAmount
                : Math.min(
                    lineRefundAmount,
                    remainingRefundableAmount,
                );
            order.orderStatus =
                allItemsCancelled
                    ? OrderStatus.CANCELLED
                    : OrderStatus.PARTIALLY_CANCELLED;
            if (
                isRazorpayPaid(order) &&
                refundAmount > 0
            ) {
                const requestId =
                    `refund_${order._id.toString()}_item_${itemIndex}`;
                refundRequest = {
                    requestId,
                    amount: refundAmount,
                    itemIndex,
                };
                order.pendingRefundAmount =
                    roundMoney(
                        pendingRefund + refundAmount
                    );
                order.refundStatus =
                    RefundStatus.PENDING;
                item.refundRequestId =
                    requestId;
                item.refundStatus =
                    RefundStatus.PENDING;
                item.refundAmount =
                    refundAmount;
                if (!Array.isArray(order.refunds)) {
                    order.refunds = [];
                }
                order.refunds.push({
                    requestId,
                    itemIndex,
                    amount: refundAmount,
                    status: RefundStatus.PENDING,
                    razorpayRefundId: "",
                    razorpayPaymentId:
                        String(order.razorpayPaymentId || ""),
                    requestedAt: new Date(),
                } as any);
            }
            cancelledOrder = order;
            await order.save({ session });
            await session.commitTransaction();
        } catch (error) {
            try {
                await session.abortTransaction();
            } catch {
                // Ignore abort errors.
            }
            throw error;
        } finally {
            await session.endSession();
        }
        if (refundRequest) {
            try {
                if (!cancelledOrder?.razorpayPaymentId) {
                    throw new Error(
                        "Razorpay payment information is missing."
                    );
                }
                const refund =
                    await PaymentService.refundPayment(
                        refundRequest.requestId,
                        cancelledOrder.razorpayPaymentId,
                        refundRequest.amount,
                    );
                await processRefundResponse(
                    orderId,
                    refundRequest.itemIndex,
                    refundRequest.requestId,
                    refund,
                );
            } catch (refundError: any) {
                console.error(
                    "ORDER ITEM REFUND ERROR:",
                    refundError,
                );
                await markRefundFailed(
                    orderId,
                    refundRequest.itemIndex,
                    refundRequest.requestId,
                    refundError,
                );
            }
        }
        try {
            await NotificationService.create({
                userId,
                type: NotificationType.ORDER_CANCELLED,
                title: "Product Cancelled",
                message:
                    `A product from your order #${cancelledOrder._id
                        .toString()
                        .slice(-8)} has been cancelled successfully${refundRequest
                            ? ` and a refund of ₹${refundRequest.amount.toFixed(2)} has been initiated.`
                            : "."
                    }`,
                orderId: cancelledOrder._id,
            });
        } catch (notificationError) {
            console.error(
                "PRODUCT CANCELLATION NOTIFICATION ERROR:",
                notificationError,
            );
        }
        return await Order.findOne({
            _id: orderId,
            user: userId,
        })
            .populate(
                "user",
                "name email phone profileImage"
            )
            .populate(
                "items.seller",
                "name email phone business"
            )
            .populate(
                "items.product",
                "name thumbnail"
            );
    }
    // =========================================
    // CANCEL ENTIRE ORDER
    // =========================================
    static async cancelOrder(
        userId: string,
        orderId: string
    ) {
        const session =
            await mongoose.startSession();
        let cancelledOrder: any = null;
        let refundRequest: {
            requestId: string;
            amount: number;
        } | null = null;
        try {
            session.startTransaction();
            const order =
                await Order.findOne({
                    _id: orderId,
                    user: userId,
                }).session(session);
            if (!order) {
                throw new Error("Order not found");
            }
            if (order.orderStatus === OrderStatus.CANCELLED) {
                throw new Error("Order is already cancelled");
            }
            if (
                order.orderStatus !== OrderStatus.PENDING &&
                order.orderStatus !== OrderStatus.PARTIALLY_CANCELLED
            ) {
                throw new Error(
                    "Order can only be cancelled while it is pending."
                );
            }
            let restoredAnyItem = false;
            for (let index = 0; index < order.items.length; index++) {
                const item: any = order.items[index];
                const orderedQuantity =
                    Number(item.quantity) || 0;
                const cancelledQuantity =
                    Number(item.cancelledQuantity || 0);
                const remainingQuantity =
                    orderedQuantity - cancelledQuantity;
                if (remainingQuantity <= 0) {
                    continue;
                }
                const product =
                    await Product.findById(
                        item.product
                    ).session(session);
                if (!product) {
                    throw new Error(
                        `Product ${item.name} no longer exists. Order cancellation was not completed so inventory remains consistent.`
                    );
                }
                await restoreStockForItem(
                    product,
                    {
                        ...item.toObject(),
                        quantity: remainingQuantity,
                    },
                    session,
                );
                item.cancelledQuantity = orderedQuantity;
                item.cancelledAt = new Date();
                restoredAnyItem = true;
            }
            if (!restoredAnyItem) {
                throw new Error(
                    "There are no active products left to cancel."
                );
            }
            const alreadyRefunded =
                roundMoney(Number(order.refundedAmount || 0));
            const pendingRefund =
                roundMoney(Number(order.pendingRefundAmount || 0));
            const remainingRefundableAmount =
                Math.max(
                    0,
                    roundMoney(
                        Number(order.total || 0) -
                        alreadyRefunded -
                        pendingRefund
                    )
                );
            order.orderStatus =
                OrderStatus.CANCELLED;
            if (
                isRazorpayPaid(order) &&
                remainingRefundableAmount > 0
            ) {
                const requestId =
                    `refund_${order._id.toString()}_full`;
                refundRequest = {
                    requestId,
                    amount: remainingRefundableAmount,
                };
                order.pendingRefundAmount =
                    roundMoney(
                        pendingRefund +
                        remainingRefundableAmount
                    );
                order.refundStatus =
                    RefundStatus.PENDING;
                if (!Array.isArray(order.refunds)) {
                    order.refunds = [];
                }
                order.refunds.push({
                    requestId,
                    itemIndex: -1,
                    amount: remainingRefundableAmount,
                    status: RefundStatus.PENDING,
                    razorpayRefundId: "",
                    razorpayPaymentId:
                        String(order.razorpayPaymentId || ""),
                    requestedAt: new Date(),
                } as any);
            }
            cancelledOrder = order;
            await order.save({ session });
            await session.commitTransaction();
        } catch (error) {
            try {
                await session.abortTransaction();
            } catch {
                // Ignore abort errors.
            }
            throw error;
        } finally {
            await session.endSession();
        }
        if (refundRequest) {
            try {
                if (!cancelledOrder?.razorpayPaymentId) {
                    throw new Error(
                        "Razorpay payment information is missing."
                    );
                }
                const refund =
                    await PaymentService.refundPayment(
                        refundRequest.requestId,
                        cancelledOrder.razorpayPaymentId,
                        refundRequest.amount,
                    );
                await processRefundResponse(
                    orderId,
                    -1,
                    refundRequest.requestId,
                    refund,
                );
            } catch (refundError: any) {
                console.error(
                    "ORDER REFUND ERROR:",
                    refundError,
                );
                await markRefundFailed(
                    orderId,
                    -1,
                    refundRequest.requestId,
                    refundError,
                );
            }
        }
        try {
            await NotificationService.create({
                userId,
                type: NotificationType.ORDER_CANCELLED,
                title: "Order Cancelled",
                message:
                    refundRequest
                        ? `Your order #${cancelledOrder._id
                            .toString()
                            .slice(-8)} has been cancelled. A refund of ₹${refundRequest.amount.toFixed(2)} has been initiated.`
                        : `Your order #${cancelledOrder._id
                            .toString()
                            .slice(-8)} has been cancelled successfully.`,
                orderId: cancelledOrder._id,
            });
        } catch (notificationError) {
            console.error(
                "ORDER CANCELLATION NOTIFICATION ERROR:",
                notificationError,
            );
        }
        return await Order.findOne({
            _id: orderId,
            user: userId,
        });
    }
}
