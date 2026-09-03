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

                    fullName:
                        address.fullName,

                    phone:
                        address.phone,

                    pincode:
                        address.pincode,

                    house:
                        address.house,

                    area:
                        address.area,

                    landmark:
                        address.landmark,

                    city:
                        address.city,

                    state:
                        address.state,

                    country:
                        address.country,
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
        });
    }

    // =========================================
    // CANCEL ORDER
    // =========================================

    static async cancelOrder(
        userId: string,
        orderId: string
    ) {
        // =====================================
        // GET ORDER
        // =====================================

        const existingOrder =
            await Order.findOne({
                _id: orderId,
                user: userId,
            });

        if (!existingOrder) {
            throw new Error(
                "Order not found"
            );
        }

        // =====================================
        // PREVENT DOUBLE CANCELLATION
        // =====================================

        if (
            existingOrder.orderStatus ===
            OrderStatus.CANCELLED
        ) {
            throw new Error(
                "Order is already cancelled"
            );
        }

        // =====================================
        // CANCEL + RESTORE STOCK
        // =====================================

        const session =
            await mongoose.startSession();

        let cancelledOrder: any = null;

        try {
            session.startTransaction();

            const order =
                await Order.findOne({
                    _id: orderId,
                    user: userId,
                }).session(session);

            if (!order) {
                throw new Error(
                    "Order not found"
                );
            }

            if (
                order.orderStatus ===
                OrderStatus.CANCELLED
            ) {
                throw new Error(
                    "Order is already cancelled"
                );
            }

            // =====================================
            // RESTORE STOCK
            // =====================================

            for (
                const item of order.items
            ) {
                const product =
                    await Product.findById(
                        item.product
                    ).session(session);

                if (!product) {
                    continue;
                }

                const quantity =
                    Number(item.quantity) || 0;

                if (quantity <= 0) {
                    continue;
                }

                // =================================
                // VARIANT PRODUCT
                // =================================

                if (item.variant?.sku) {
                    const selectedVariant =
                        product.variants?.find(
                            (variant: any) =>
                                String(
                                    variant.sku
                                ) ===
                                String(
                                    item.variant?.sku
                                )
                        );

                    if (!selectedVariant) {
                        continue;
                    }

                    const optionType =
                        String(
                            item.variant?.optionType ||
                            ""
                        )
                            .trim()
                            .toLowerCase();

                    const optionValue =
                        String(
                            item.variant?.optionValue ||
                            ""
                        ).trim();

                    // =================================
                    // SIZE
                    // =================================

                    if (
                        optionType === "size" &&
                        optionValue &&
                        Array.isArray(
                            selectedVariant.sizes
                        ) &&
                        selectedVariant.sizes.length > 0
                    ) {
                        const option =
                            selectedVariant.sizes.find(
                                (entry: any) =>
                                    String(
                                        entry.size
                                    )
                                        .trim()
                                        .toLowerCase() ===
                                    optionValue.toLowerCase()
                            );

                        if (option) {
                            option.stock =
                                Number(
                                    option.stock || 0
                                ) + quantity;

                            selectedVariant.stock =
                                recalculateVariantStock(
                                    selectedVariant
                                );
                        }
                    }

                    // =================================
                    // SHADE
                    // =================================

                    else if (
                        optionType === "shade" &&
                        optionValue &&
                        Array.isArray(
                            selectedVariant.shades
                        ) &&
                        selectedVariant.shades.length > 0
                    ) {
                        const option =
                            selectedVariant.shades.find(
                                (entry: any) =>
                                    String(
                                        entry.shade
                                    )
                                        .trim()
                                        .toLowerCase() ===
                                    optionValue.toLowerCase()
                            );

                        if (option) {
                            option.stock =
                                Number(
                                    option.stock || 0
                                ) + quantity;

                            selectedVariant.stock =
                                recalculateVariantStock(
                                    selectedVariant
                                );
                        }
                    }

                    // =================================
                    // COLOR
                    // =================================

                    else if (
                        optionType === "color" &&
                        optionValue &&
                        Array.isArray(
                            selectedVariant.colors
                        ) &&
                        selectedVariant.colors.length > 0
                    ) {
                        const option =
                            selectedVariant.colors.find(
                                (entry: any) =>
                                    String(
                                        entry.color
                                    )
                                        .trim()
                                        .toLowerCase() ===
                                    optionValue.toLowerCase()
                            );

                        if (option) {
                            option.stock =
                                Number(
                                    option.stock || 0
                                ) + quantity;

                            selectedVariant.stock =
                                recalculateVariantStock(
                                    selectedVariant
                                );
                        }
                    }

                    // =================================
                    // NORMAL VARIANT
                    // =================================

                    else {
                        selectedVariant.stock =
                            Number(
                                selectedVariant.stock || 0
                            ) + quantity;
                    }
                }

                // =================================
                // NORMAL PRODUCT
                // =================================

                else {
                    product.stock =
                        Number(
                            product.stock || 0
                        ) + quantity;
                }

                await product.save({
                    session,
                });
            }

            // =====================================
            // UPDATE ORDER STATUS
            // =====================================

            order.orderStatus =
                OrderStatus.CANCELLED;

            // =====================================
            // INITIAL REFUND STATE
            // =====================================

            const isRazorpayPaid =
                String(
                    order.paymentMethod || ""
                )
                    .trim()
                    .toLowerCase() ===
                "razorpay" &&
                order.paymentStatus ===
                PaymentStatus.SUCCESS;

            if (isRazorpayPaid) {
                order.refundStatus =
                    RefundStatus.PENDING;
            }

            await order.save({
                session,
            });

            cancelledOrder = order;

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

        // =====================================
        // RAZORPAY REFUND
        //
        // External Razorpay calls cannot be part
        // of the MongoDB transaction. The order is
        // therefore cancelled first with refundStatus
        // pending, then the refund is processed.
        // =====================================

        const requiresRefund =
            String(
                cancelledOrder?.paymentMethod || ""
            )
                .trim()
                .toLowerCase() ===
            "razorpay" &&
            cancelledOrder?.paymentStatus ===
            PaymentStatus.SUCCESS;

        if (requiresRefund) {
            try {
                if (
                    !cancelledOrder?.razorpayPaymentId
                ) {
                    throw new Error(
                        "Razorpay payment information is missing."
                    );
                }

                const refund =
                    await PaymentService.refundPayment(
                        cancelledOrder._id.toString(),
                        cancelledOrder.razorpayPaymentId,
                        Number(
                            cancelledOrder.total
                        )
                    );

                const refundStatus =
                    String(
                        refund?.status || "pending"
                    ).toLowerCase();

                const finalRefundStatus =
                    refundStatus === "processed"
                        ? RefundStatus.PROCESSED
                        : RefundStatus.PENDING;

                cancelledOrder.refundStatus =
                    finalRefundStatus;

                if (refund?.id) {
                    cancelledOrder.refundId =
                        String(refund.id);
                }

                cancelledOrder.refundedAmount =
                    Number(
                        refund?.amount ||
                        Math.round(
                            Number(
                                cancelledOrder.total
                            ) * 100
                        )
                    ) / 100;

                cancelledOrder.refundedAt =
                    new Date();

                await cancelledOrder.save();

            } catch (refundError) {
                console.error(
                    "ORDER REFUND ERROR:",
                    refundError
                );

                cancelledOrder.refundStatus =
                    RefundStatus.FAILED;

                await cancelledOrder.save();
            }
        }

        // =====================================
        // CUSTOMER CANCELLATION NOTIFICATION
        // =====================================

        try {
            await NotificationService.create({
                userId: userId,

                type:
                    NotificationType.ORDER_CANCELLED,

                title:
                    "Order Cancelled",

                message:
                    `Your order #${cancelledOrder._id
                        .toString()
                        .slice(-8)} has been cancelled successfully.`,

                orderId:
                    cancelledOrder._id,
            });
        } catch (
        notificationError
        ) {
            console.error(
                "ORDER CANCELLATION NOTIFICATION ERROR:",
                notificationError
            );
        }

        return cancelledOrder;
    }

}