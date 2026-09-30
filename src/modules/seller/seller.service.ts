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


const sellerOrderView = (order: any, seller: string) => {
    if (!order) return null;
    const value = typeof order.toJSON === "function" ? order.toJSON() : order;
    const onlyThisSeller = value.items.every((item: any) => String(item.seller?._id || item.seller) === seller);
    value.items = value.items.map((item: any, index: number) => ({ ...item, orderItemIndex: index }))
        .filter((item: any) => String(item.seller?._id || item.seller) === seller);
    const active = value.items.filter((item: any) => item.quantity > (item.cancelledQuantity || 0));
    if (!active.length) value.orderStatus = "cancelled";
    else if (active.every((item: any) => item.fulfilmentStatus === "delivered")) value.orderStatus = "delivered";
    else if (active.some((item: any) => item.fulfilmentStatus === "shipped" || item.fulfilmentStatus === "delivered")) value.orderStatus = "shipped";
    else if (active.every((item: any) => item.fulfilmentStatus === "pending")) value.orderStatus = "pending";
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

            ).then(result => Array.isArray(result) ? result.map(order => sellerOrderView(order, sellerId)) : sellerOrderView(result, sellerId));
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

            ).then(result => Array.isArray(result) ? result.map(order => sellerOrderView(order, sellerId)) : sellerOrderView(result, sellerId));
    }


    // =========================================
    // UPDATE ORDER STATUS
    // =========================================

    static async updateOrderStatus(sellerId: string, orderId: string, status: string) {
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


        return await User.findOneAndUpdate(

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
