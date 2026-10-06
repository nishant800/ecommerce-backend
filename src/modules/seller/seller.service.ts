import { canProcessDelivery, isDeliveryPlaced, startDeliveryProcessing } from "../orders/delivery-lifecycle.js";
import { getSellerPickupAvailability, validatePickupSchedule, pickupLocalDate } from '../orders/pickup-schedule.js';
import { getMissingPickupAddressFields } from './pickup-profile-validation.js';
import { OrderService } from "../orders/order.service.js";
import { EarningService } from "../payout/earning.service.js";
import { OrderStatus, PaymentStatus } from "../orders/order.model.js";
import mongoose from "mongoose";

import Order from "../orders/order.model.js";
import Product from "../products/product.model.js";
import User from "../users/user.model.js";

import {
    NotificationService,
} from "../../notifications/notification.service.js";

import {
    NotificationType,
    NotificationRecipientRole,
} from "../../notifications/notification.model.js";



// =========================================
// SELLER ORDER VISIBILITY
// =========================================
//
// New online orders are hidden until payment
// confirmation sets sellerReleasedAt.
//
// COD is immediately seller-visible.
//
// The legacy SUCCESS fallback keeps older paid
// online orders visible if they were created
// before sellerReleasedAt existed. It applies
// only when the field is completely absent, so
// a new cancelled-before-capture order with
// sellerReleasedAt: null is still hidden.
// =========================================

const sellerVisibleOrderFilter = () => ({
    $or: [
        { fulfillmentType: "pickup", sellerReleasedAt: { $ne: null } },
        {
            sellerReleasedAt: {
                $ne: null,
            },
            paymentStatus: "success",
        },
        {
            paymentMethod: {
                $regex:
                    /^(cod|cash on delivery|cash_on_delivery)$/i,
            },
        },
        {
            sellerReleasedAt: {
                $exists: false,
            },
            paymentStatus:
                "success",
        },
    ],
});


const normalizeDeliveryStatus = (status: unknown): string => {
    const value = String(status || 'pending').trim().toLowerCase();
    if (['placed', 'confirmed', 'partially_cancelled'].includes(value)) return 'pending';
    if (value === 'completed') return 'delivered';
    if (value === 'out for delivery') return 'out_for_delivery';
    if (value === 'canceled') return 'cancelled';
    return value;
};

const sellerOrderView = async (order: any, seller: string, schedule?: ReturnType<typeof getSellerPickupAvailability>) => {
    if (!order) return null;
    const value = typeof order.toJSON === "function" ? order.toJSON() : order;
    if (value.fulfillmentType === "pickup") {
        const status = schedule || getSellerPickupAvailability(await User.findById(seller).select('business'));
        return { ...value, storeSchedule: status, serverNow: new Date().toISOString() };
    }
    if (canProcessDelivery(value) && isDeliveryPlaced(value.orderStatus)) {
        value.items = value.items.map((item: any) => ({ ...item, fulfilmentStatus: isDeliveryPlaced(item.fulfilmentStatus || value.orderStatus) ? "processing" : item.fulfilmentStatus }));
        if (value.orderStatus !== "partially_cancelled") value.orderStatus = "processing";
    }
    value.orderStatus = normalizeDeliveryStatus(value.orderStatus);
    const onlyThisSeller = value.items.every((item: any) => String(item.seller?._id || item.seller) === seller);
    value.items = value.items.map((item: any, index: number) => ({ ...item, fulfilmentStatus: normalizeDeliveryStatus(item.fulfilmentStatus || value.orderStatus), orderItemIndex: index }))
        .filter((item: any) => String(item.seller?._id || item.seller) === seller);
    const active = value.items.filter((item: any) => item.quantity > (item.cancelledQuantity || 0));
    if (value.orderStatus === "cancelled" || !active.length) value.orderStatus = "cancelled";
    else if (active.every((item: any) => item.fulfilmentStatus === "delivered")) value.orderStatus = "delivered";
    else if (active.some((item: any) => item.fulfilmentStatus === "out_for_delivery")) value.orderStatus = "out_for_delivery";
    else if (active.some((item: any) => item.fulfilmentStatus === "shipped" || item.fulfilmentStatus === "delivered")) value.orderStatus = "shipped";
    else if (active.some((item: any) => item.fulfilmentStatus === "processing")) value.orderStatus = "processing";
    else if (active.every((item: any) => item.fulfilmentStatus === "pending")) value.orderStatus = "pending";
    value.processingAt = active.find((item: any) => item.processingAt)?.processingAt || value.processingAt;
    value.outForDeliveryAt = active.find((item: any) => item.outForDeliveryAt)?.outForDeliveryAt || value.outForDeliveryAt;
    value.subtotal = value.items.reduce((total: number, item: any) => total + item.price * Math.max(0, item.quantity - (item.cancelledQuantity || 0)), 0);
    value.total = value.subtotal;
    value.shippingCharge = 0;
    if (value.gstAmount != null) {
        // The seller view contains remaining merchandise; keep the immutable item GST snapshots intact.
        const sumGst = (key: string) => value.items.reduce((sum: number, item: any) => sum + Math.round(Number(item[key] || 0) * 100 * Math.max(0, item.quantity - (item.cancelledQuantity || 0)) / item.quantity), 0) / 100;
        value.gstAmount = sumGst("gstAmount");
        value.tax = value.gstAmount;
        value.gstDetailsComplete = value.items.every((item: any) => item.gstRate != null);
        if (value.items.every((item: any) => item.cgstAmount != null && item.sgstAmount != null && item.igstAmount != null)) {
            value.cgstAmount = sumGst("cgstAmount");
            value.igstAmount = sumGst("igstAmount");
            value.sgstAmount = Math.round((value.gstAmount - value.cgstAmount - value.igstAmount) * 100) / 100;
        } else { delete value.cgstAmount; delete value.sgstAmount; delete value.igstAmount; }
    } else if (!onlyThisSeller) {
        // Legacy mixed-seller orders cannot reliably allocate their order-level tax.
        value.gstDetailsComplete = false;
        value.tax = 0;
    }
    value.discount = value.items.reduce((total: number, item: any) => total + Math.max(0, (item.basePrice || item.price) - item.price) * Math.max(0, item.quantity - (item.cancelledQuantity || 0)), 0);
    delete value.refunds;
    delete value.refundedAmount;
    delete value.pendingRefundAmount;
    delete value.razorpaySignature;
    return value;
};

export class SellerService {


    // =========================================
    // SELLER DASHBOARD
    // =========================================

    static async getDashboard(
        sellerId: string
    ) {

        const sellerObjectId =
            new mongoose.Types.ObjectId(
                sellerId
            );


        const [
            totalOrders,
            totalProducts,
            totalCustomers,
            pendingOrders,
            shippedOrders,
            deliveredOrders,
            cancelledOrders,
            salesResult,
        ] = await Promise.all([

            // Orders containing this seller's products
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,

                ...sellerVisibleOrderFilter(),
            }),


            // Only this seller's products
            Product.countDocuments({
                seller:
                    sellerObjectId,
            }),


            // Customers who have purchased
            // this seller's products
            Order.distinct(
                "user",
                {
                    "items.seller":
                        sellerObjectId,

                    ...sellerVisibleOrderFilter(),
                }
            ).then(
                users =>
                    users.length
            ),


            // Pending
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,

                ...sellerVisibleOrderFilter(),

                orderStatus:
                    "pending",
            }),


            // Shipped
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,

                ...sellerVisibleOrderFilter(),

                orderStatus:
                    "shipped",
            }),


            // Delivered
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,

                ...sellerVisibleOrderFilter(),

                orderStatus:
                    "delivered",
            }),


            // Cancelled
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,

                ...sellerVisibleOrderFilter(),

                orderStatus:
                    "cancelled",
            }),


            // Seller-specific sales + profit
            Order.aggregate([

                {
                    $match: {

                        "items.seller":
                            sellerObjectId,

                        ...sellerVisibleOrderFilter(),

                        orderStatus: {
                            $ne:
                                "cancelled",
                        },
                    },
                },


                {
                    $unwind:
                        "$items",
                },


                {
                    $match: {

                        "items.seller":
                            sellerObjectId,

                    },
                },


                // Get the seller's current product cost.
                // Profit = selling price - cost price.
                {
                    $lookup: {

                        from:
                            "products",

                        localField:
                            "items.product",

                        foreignField:
                            "_id",

                        as:
                            "productData",
                    },
                },


                {
                    $unwind: {

                        path:
                            "$productData",

                        preserveNullAndEmptyArrays:
                            true,
                    },
                },


                {
                    $group: {

                        _id:
                            null,


                        totalSales: {

                            $sum: {

                                $multiply: [

                                    "$items.price",

                                    { $max: [0, { $subtract: ["$items.quantity", { $ifNull: ["$items.cancelledQuantity", 0] }] }] },

                                ],
                            },
                        },


                        totalProfit: {

                            $sum: {

                                $multiply: [

                                    {

                                        $subtract: [

                                            "$items.price",

                                            {

                                                $ifNull: [

                                                    "$productData.costPrice",

                                                    0,

                                                ],
                                            },
                                        ],
                                    },

                                    { $max: [0, { $subtract: ["$items.quantity", { $ifNull: ["$items.cancelledQuantity", 0] }] }] },

                                ],
                            },
                        },
                    },
                },

            ]),

        ]);


        const totalSales =
            salesResult[0]?.totalSales ||
            0;


        const totalProfit =
            salesResult[0]?.totalProfit ||
            0;


        return {

            totalOrders,

            totalProducts,

            totalCustomers,

            totalSales,

            totalProfit,
            payments: await EarningService.summary(sellerId),


            orderStatus: {

                pending:
                    pendingOrders,

                shipped:
                    shippedOrders,

                delivered:
                    deliveredOrders,

                cancelled:
                    cancelledOrders,

            },
        };
    }


    // =========================================
    // SELLER ORDERS
    // =========================================

    static async getOrders(
        sellerId: string
    ) {

        const { PickupService } = await import("../orders/pickup.service.js");
        await PickupService.expireFor({ "pickup.sellerId": sellerId });
        if (!mongoose.isValidObjectId(sellerId)) throw new Error("Invalid seller ID");
        const sellerObjectId =
            new mongoose.Types.ObjectId(
                sellerId
            );


        return await Order.find({

            "items.seller":
                sellerObjectId,

            ...sellerVisibleOrderFilter(),

        })
            .sort({

                createdAt:
                    -1,

            })
            .populate(

                "user",

                "name email phone"

            )
            .populate(

                "items.product",

                "name thumbnail"

            )
            .populate(

                "items.seller",

                "name phone business"

            ).then(async result => {
                const orders = Array.isArray(result) ? result : [result];
                const schedule = orders.some(order => order?.fulfillmentType === 'pickup')
                    ? getSellerPickupAvailability(await User.findById(sellerId).select('business')) : undefined;
                return Array.isArray(result) ? Promise.all(result.map(order => sellerOrderView(order, sellerId, schedule))) : sellerOrderView(result, sellerId, schedule);
            });
    }


    // =========================================
    // SELLER ORDER DETAILS
    // =========================================

    static async getOrder(
        sellerId: string,
        orderId: string
    ) {

        if (!mongoose.isValidObjectId(sellerId)) throw new Error("Invalid seller ID");
        const sellerObjectId =
            new mongoose.Types.ObjectId(
                sellerId
            );


        if (!mongoose.isValidObjectId(orderId)) throw new Error("Invalid order ID");
        return await Order.findOne({

            _id:
                orderId,

            "items.seller":
                sellerObjectId,

            ...sellerVisibleOrderFilter(),

        })
            .populate(

                "user",

                "name email phone"

            )
            .populate(

                "items.product",

                "name thumbnail"

            )
            .populate(

                "items.seller",

                "name phone business"

            ).then(async result => {
                const orders = Array.isArray(result) ? result : [result];
                const schedule = orders.some(order => order?.fulfillmentType === 'pickup')
                    ? getSellerPickupAvailability(await User.findById(sellerId).select('business')) : undefined;
                return Array.isArray(result) ? Promise.all(result.map(order => sellerOrderView(order, sellerId, schedule))) : sellerOrderView(result, sellerId, schedule);
            });
    }


    // =========================================
    // UPDATE ORDER STATUS
    // =========================================

    static async updateOrderStatus(sellerId: string, orderId: string, status: string, labelGenerated = false) {
        if (status === "shipped" && !labelGenerated) throw new Error("Generate a shipping label to mark this order shipped");
        if (!mongoose.isValidObjectId(orderId)) throw new Error("Invalid order ID");
        if (!["processing", "shipped", "out_for_delivery", "delivered", "cancelled"].includes(status)) throw new Error("Invalid order transition");
        const order = await Order.findOne({ _id: orderId, "items.seller": sellerId, ...sellerVisibleOrderFilter() });
        if (!order) return null;
        if (order.fulfillmentType === "pickup") throw new Error("Use the Store Pickup actions for this order");
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
                if (!current || current.fulfillmentType === "pickup" || current.orderStatus === OrderStatus.CANCELLED) throw new Error("Order is unavailable");
                if (!canProcessDelivery(current)) throw new Error("Payment must be confirmed before processing");
                startDeliveryProcessing(current);
                // Snapshot legacy item state before changing the aggregate order status.
                for (const item of current.items) {
                    item.fulfilmentStatus = normalizeDeliveryStatus(item.fulfilmentStatus || current.orderStatus);
                }
                const items = current.items.filter(i => String(i.seller) === sellerId && i.quantity > i.cancelledQuantity);
                if (!items.length) throw new Error("No active seller items");
                for (const item of items) {
                    const previous = item.fulfilmentStatus || current.orderStatus;
                    if (previous === status) continue;
                    if ((status === "processing" && previous !== "pending") || (status === "shipped" && previous !== "processing") || (status === "out_for_delivery" && previous !== "shipped") || (status === "delivered" && previous !== "out_for_delivery")) throw new Error("Invalid order transition");
                    if (item.refundStatus === 'processed' || item.refundStatus === 'pending') throw new Error('Refunded items cannot be dispatched');
                    item.fulfilmentStatus = status;
                    if (status === "processing") item.processingAt = new Date();
                    if (status === "out_for_delivery") item.outForDeliveryAt = new Date();
                    if (status === "delivered") item.deliveredAt = new Date();
                }
                const active = current.items.filter(i => i.quantity > i.cancelledQuantity);
                if (active.every(i => i.fulfilmentStatus === "delivered")) {
                    current.orderStatus = OrderStatus.DELIVERED;
                    current.deliveredAt = current.deliveredAt || new Date();
                    if (/^cod$/i.test(current.paymentMethod)) current.paymentStatus = PaymentStatus.SUCCESS;
                } else if (active.some(i => i.fulfilmentStatus === 'out_for_delivery')) {
                    current.orderStatus = OrderStatus.OUT_FOR_DELIVERY;
                    current.outForDeliveryAt = current.outForDeliveryAt || new Date();
                } else if (active.some(i => ['shipped', 'delivered'].includes(i.fulfilmentStatus || ''))) {
                    current.orderStatus = OrderStatus.SHIPPED; current.shippedAt = current.shippedAt || new Date();
                } else {
                    current.orderStatus = OrderStatus.PROCESSING; current.processingAt = current.processingAt || new Date();
                }
                if (status === 'shipped') current.shippingLabelGeneratedAt = current.shippingLabelGeneratedAt || new Date();
                await current.save({ session });
                await NotificationService.enqueue({ userId: current.user, recipientRole: NotificationRecipientRole.CUSTOMER, type: status === "processing" ? NotificationType.GENERAL : status === "shipped" ? NotificationType.ORDER_SHIPPED : status === "out_for_delivery" ? NotificationType.GENERAL : NotificationType.ORDER_DELIVERED,
                    title: status === "processing" ? "Order Processing" : status === "shipped" ? "Order Shipped" : status === "out_for_delivery" ? "Out for Delivery" : "Order Delivered", message: status === "processing" ? "Your order is being processed." : status === "shipped" ? "Your order has been shipped." : status === "out_for_delivery" ? "Your order is out for delivery." : "Your order has been delivered.",
                    orderId: current._id, dedupeKey: `seller-order-status:${orderId}:${sellerId}:${status}` }, session);
            }); } finally { await session.endSession(); }
        }
        await EarningService.reconcileOrder(orderId);
        return this.getOrder(sellerId, orderId);
    }

    static async resolveDeliveryBarcode(sellerId: string, barcode: unknown) {
        if (typeof barcode !== 'string' || barcode.length > 512) throw new Error('Invalid delivery barcode');
        let reference = barcode.trim();
        // Existing Code 128 labels contain the full order ID; existing QR labels wrap that ID.
        if (reference.startsWith('{')) {
            try { reference = JSON.parse(reference).orderId; } catch { throw new Error('Invalid delivery barcode'); }
        }
        if (typeof reference !== 'string' || !/^[a-f0-9]{24}$/i.test(reference)) throw new Error('Scan an order shipping label, not a product/SKU barcode');
        const order = await this.getOrder(sellerId, reference);
        if (!order) throw new Error('Delivery order not found or does not belong to this seller');
        if (order.fulfillmentType === 'pickup') throw new Error('Store Pickup is not a Home Delivery order');
        const active = order.items.filter((item: any) => item.quantity > (item.cancelledQuantity || 0));
        if (order.orderStatus === "cancelled" || !active.length || active.some((item: any) => ['pending', 'processed'].includes(item.refundStatus))) {
            return { order, allowedAction: null, message: order.orderStatus === 'cancelled' || !active.length ? 'Order cancelled' : 'Refunded orders cannot be dispatched' };
        }
        const states = active.map((item: any) => item.fulfilmentStatus || order.orderStatus);
        const allowedAction = states.every((state: string) => state === 'shipped') ? 'MARK_OUT_FOR_DELIVERY'
            : states.every((state: string) => state === 'out_for_delivery') ? 'MARK_DELIVERED' : null;
        return { order, allowedAction, message: allowedAction ? undefined : order.orderStatus === 'delivered' ? 'Order already delivered' : 'Order is not ready for delivery' };
    }

    static async markOrderShippedAfterLabel(sellerId: string, orderId: string) {
        // The existing label endpoint is the only seller path into Shipped.
        return this.updateOrderStatus(sellerId, orderId, "shipped", true);
    }

    static async getProfile(
        sellerId: string
    ) {

        return await User.findOne({

            _id:
                sellerId,

            role:
                "seller",

        }).select(
            "-password"
        );
    }


    // =========================================
    // UPDATE SELLER PROFILE
    // =========================================

    static async updateProfile(
        sellerId: string,
        data: any
    ) {

        const seller =
            await User.findOne({

                _id:
                    sellerId,

                role:
                    "seller",

            });


        if (!seller) {

            return null;
        }


        const updateData: any = {};
        let cancelPickupIds: string[] = [];


        // =====================================
        // PERSONAL DETAILS
        // =====================================

        if (
            typeof data?.name ===
            "string"
        ) {

            const name =
                data.name.trim();


            if (name) {

                updateData.name =
                    name;
            }
        }


        if (
            typeof data?.email ===
            "string"
        ) {

            const email =
                data.email
                    .trim()
                    .toLowerCase();


            if (
                email &&
                email !==
                seller.email
            ) {

                const existingUser =
                    await User.findOne({

                        email,

                        _id: {

                            $ne:
                                seller._id,

                        },
                    });


                if (existingUser) {

                    throw new Error(
                        "Email is already registered"
                    );
                }


                updateData.email =
                    email;
            }
        }


        if (
            typeof data?.phone ===
            "string"
        ) {

            const phone =
                data.phone.trim();


            if (
                phone &&
                phone !==
                seller.phone
            ) {

                const existingUser =
                    await User.findOne({

                        phone,

                        _id: {

                            $ne:
                                seller._id,

                        },
                    });


                if (existingUser) {

                    throw new Error(
                        "Phone number is already registered"
                    );
                }


                updateData.phone =
                    phone;
            }
        }


        // =====================================
        // BUSINESS DETAILS
        // =====================================

        if (
            data?.business &&
            typeof data.business ===
            "object"
        ) {

            if (data.business.pickupSchedule !== undefined) {
                const schedule = validatePickupSchedule(data.business.pickupSchedule);
                const previous = seller.business?.pickupSchedule;
                const addedDates = schedule.specialClosures.filter(entry => !previous?.specialClosures?.some(old => old.date === entry.date)).map(entry => entry.date);
                const newlyTemporary = schedule.temporarilyClosed && !previous?.temporarilyClosed;
                const activeOrders = await Order.find({ fulfillmentType: 'pickup', 'pickup.sellerId': sellerId,
                    'pickup.status': { $in: ['reserved', 'ready'] }, 'pickup.expiresAt': { $gt: new Date() } }).select('_id pickup');
                const affected = activeOrders.filter(order => newlyTemporary || addedDates.includes(pickupLocalDate(order.pickup!.reservedAt)));
                if (affected.length && !['keep', 'cancel'].includes(data.pickupClosureAction)) {
                    throw Object.assign(new Error(`You have ${affected.length} active pickup reservations${newlyTemporary ? '' : ' on this date'}. Choose whether to keep existing reservations or cancel affected reservations.`), { activePickupCount: affected.length });
                }
                updateData['business.pickupSchedule'] = schedule;
                // Schedule edits alone never invalidate existing reservations.
                if (affected.length && data.pickupClosureAction === 'cancel') {
                    cancelPickupIds = affected.map(order => String(order._id));
                }
            }
            if (data.business.pickupEnabled === true) {
                // Match the string-only, trimmed fields that the profile update actually saves.
                const business = { ...seller.toObject().business, ...Object.fromEntries(
                    Object.entries(data.business).filter(([, value]) => typeof value === 'string')
                        .map(([field, value]) => [field, (value as string).trim()])
                ) };
                const missing = getMissingPickupAddressFields({
                    business, phone: updateData.phone || seller.phone,
                });
                if (missing.length) {
                    throw Object.assign(new Error(`Complete ${missing.length === 1 ? 'this detail' : 'these details'} first: ${missing.join(', ')}`), { missingFields: missing });
                }
            }
            if (typeof data.business.pickupEnabled === "boolean") {
                updateData["business.pickupEnabled"] = data.business.pickupEnabled;
            }
            const allowedFields = [

                "shopName",

                "address",

                "area",

                "landmark",

                "city",

                "state",

                "pincode",

                "country",

                "shopPhone",

                "businessType",

                "gstin",

                "replacementShop",

                "replacementPolicy",

            ];


            for (
                const field of
                allowedFields
            ) {

                if (
                    typeof data.business[field] ===
                    "string"
                ) {

                    updateData[
                        `business.${field}`
                    ] =

                        data.business[field]
                            .trim();
                }
            }
        }


        if (
            Object.keys(
                updateData
            ).length === 0
        ) {

            return await User.findOne({

                _id:
                    sellerId,

                role:
                    "seller",

            }).select(
                "-password"
            );
        }


        const updated = await User.findOneAndUpdate(

            {

                _id:
                    sellerId,

                role:
                    "seller",

            },

            {

                $set:
                    updateData,

            },

            {

                new:
                    true,

                runValidators:
                    true,

            }

        ).select(
            "-password"
        );
        if (updated && cancelPickupIds.length) {
            const { PickupService } = await import('../orders/pickup.service.js');
            for (const id of cancelPickupIds) {
                // A reservation may expire or complete between confirmation and cancellation.
                const active = await Order.exists({ _id: id, 'pickup.sellerId': sellerId,
                    'pickup.status': { $in: ['reserved', 'ready'] }, 'pickup.expiresAt': { $gt: new Date() } });
                if (active) await PickupService.release(id, 'cancelled');
            }
        }
        return updated;
    }


    // =========================================
    // DELETE SELLER ACCOUNT
    // =========================================

    static async deleteAccount(
        sellerId: string
    ) {

        return await User.findOneAndUpdate(

            {

                _id:
                    sellerId,

                role:
                    "seller",

            },

            {

                $set: {

                    isActive:
                        false,

                },
            },

            {

                new:
                    true,

            }

        ).select(
            "-password"
        );
    }
}
