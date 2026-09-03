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
                }
            ).then(
                users =>
                    users.length
            ),


            // Pending
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,
                orderStatus:
                    "pending",
            }),


            // Shipped
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,
                orderStatus:
                    "shipped",
            }),


            // Delivered
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,
                orderStatus:
                    "delivered",
            }),


            // Cancelled
            Order.countDocuments({
                "items.seller":
                    sellerObjectId,
                orderStatus:
                    "cancelled",
            }),


            // Seller-specific sales + profit
            Order.aggregate([

                {
                    $match: {

                        "items.seller":
                            sellerObjectId,

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

                                    "$items.quantity",

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

                                    "$items.quantity",

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

        const sellerObjectId =
            new mongoose.Types.ObjectId(
                sellerId
            );


        return await Order.find({

            "items.seller":
                sellerObjectId,

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

            );
    }


    // =========================================
    // SELLER ORDER DETAILS
    // =========================================

    static async getOrder(
        sellerId: string,
        orderId: string
    ) {

        const sellerObjectId =
            new mongoose.Types.ObjectId(
                sellerId
            );


        return await Order.findOne({

            _id:
                orderId,

            "items.seller":
                sellerObjectId,

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

            );
    }


    // =========================================
    // UPDATE ORDER STATUS
    // =========================================

    static async updateOrderStatus(
        sellerId: string,
        orderId: string,
        status: string
    ) {

        const allowedStatuses = [

            "pending",

            "shipped",

            "delivered",

            "cancelled",

        ];


        if (
            !allowedStatuses.includes(
                status
            )
        ) {

            throw new Error(
                "Invalid order status"
            );
        }


        const sellerObjectId =
            new mongoose.Types.ObjectId(
                sellerId
            );


        // =====================================
        // BUILD STATUS UPDATE
        // =====================================

        const updateData: any = {

            orderStatus:
                status,

        };


        if (
            status ===
            "shipped"
        ) {

            updateData.shippedAt =
                new Date();

        }


        if (
            status ===
            "delivered"
        ) {

            updateData.deliveredAt =
                new Date();

        }


        // =====================================
        // COD PAYMENT
        // =====================================
        //
        // Cash on Delivery becomes paid only
        // when the seller confirms delivery.
        //
        // Online/Razorpay orders are not changed.
        // =====================================

        if (
            status ===
            "delivered"
        ) {

            const existingOrder =
                await Order.findOne({

                    _id:
                        orderId,

                    "items.seller":
                        sellerObjectId,

                }).select(
                    "paymentMethod paymentStatus"
                );


            if (!existingOrder) {

                throw new Error(
                    "Order not found."
                );
            }


            const paymentMethod =
                String(

                    existingOrder.paymentMethod ||
                    ""

                )
                    .trim()
                    .toLowerCase();


            const isCOD =

                paymentMethod ===
                "cod" ||

                paymentMethod ===
                "cash on delivery" ||

                paymentMethod ===
                "cash_on_delivery";


            if (isCOD) {

                updateData.paymentStatus =
                    "paid";
            }
        }


        // =====================================
        // UPDATE ORDER
        // =====================================

        const updatedOrder =
            await Order.findOneAndUpdate(

                {

                    _id:
                        orderId,

                    "items.seller":
                        sellerObjectId,

                },

                {

                    $set:
                        updateData,

                },

                {

                    new:
                        true,

                }
            );


        if (!updatedOrder) {

            return null;
        }


        // =====================================
        // CUSTOMER STATUS NOTIFICATION
        // =====================================

        if (

            status === "shipped" ||

            status === "delivered" ||

            status === "cancelled"

        ) {

            try {

                let type:
                    NotificationType;


                let title =
                    "";


                let message =
                    "";


                if (
                    status ===
                    "shipped"
                ) {

                    type =
                        NotificationType.ORDER_SHIPPED;


                    title =
                        "Order Shipped";


                    message =
                        `Your order #${updatedOrder._id
                            .toString()
                            .slice(-8)} has been shipped.`;

                } else if (
                    status ===
                    "delivered"
                ) {

                    type =
                        NotificationType.ORDER_DELIVERED;


                    title =
                        "Order Delivered";


                    message =
                        `Your order #${updatedOrder._id
                            .toString()
                            .slice(-8)} has been delivered.`;

                } else {

                    type =
                        NotificationType.ORDER_CANCELLED;


                    title =
                        "Order Cancelled";


                    message =
                        `Your order #${updatedOrder._id
                            .toString()
                            .slice(-8)} has been cancelled.`;
                }


                await NotificationService.create({

                    userId:
                        updatedOrder.user,

                    recipientRole:
                        NotificationRecipientRole.CUSTOMER,

                    type,

                    title,

                    message,

                    orderId:
                        updatedOrder._id,
                });


            } catch (
            notificationError
            ) {

                console.error(

                    "ORDER STATUS NOTIFICATION ERROR:",

                    notificationError,

                );
            }
        }


        return updatedOrder;
    }


    // =========================================
    // MARK ORDER SHIPPED AFTER LABEL
    // =========================================

    static async markOrderShippedAfterLabel(
        sellerId: string,
        orderId: string
    ) {

        const sellerObjectId =
            new mongoose.Types.ObjectId(
                sellerId
            );


        const updatedOrder =
            await Order.findOneAndUpdate(
                {
                    _id:
                        orderId,

                    "items.seller":
                        sellerObjectId,

                    orderStatus:
                        "pending",
                },

                {
                    $set: {

                        orderStatus:
                            "shipped",

                        shippedAt:
                            new Date(),

                    },
                },

                {
                    new: true,
                }
            );


        if (!updatedOrder) {
            return null;
        }


        // =========================================
        // CUSTOMER SHIPPED NOTIFICATION
        // =========================================

        try {

            await NotificationService.create({

                userId:
                    updatedOrder.user,

                recipientRole:
                    NotificationRecipientRole.CUSTOMER,

                type:
                    NotificationType.ORDER_SHIPPED,

                title:
                    "Order Shipped",

                message:
                    `Your order #${updatedOrder._id
                        .toString()
                        .slice(-8)} has been shipped.`,

                orderId:
                    updatedOrder._id,

            });

        } catch (
        notificationError
        ) {

            console.error(
                "SHIPPED NOTIFICATION ERROR:",
                notificationError,
            );
        }


        return updatedOrder;

    }
    // GET SELLER PROFILE
    // =========================================

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