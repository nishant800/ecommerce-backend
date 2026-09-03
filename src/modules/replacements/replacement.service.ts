import crypto from "crypto";

import mongoose from "mongoose";

import ReplacementRequest, {
    ReplacementStatus,
    ReplacementType,
} from "./replacement.model.js";

import Order, {
    OrderStatus,
} from "../orders/order.model.js";

import User from "../users/user.model.js";

import {
    NotificationService,
} from "../../notifications/notification.service.js";

import {
    NotificationType,
} from "../../notifications/notification.model.js";


// =========================================
// BARCODE VALUE
// =========================================

const createUniqueBarcode =
    (
        prefix: string,
    ) => {

        return `${prefix}-${crypto
            .randomBytes(18)
            .toString("hex")
            .toUpperCase()}`;
    };


// =========================================
// REPLACEMENT SERVICE
// =========================================

export class ReplacementService {


    // =========================================
    // CREATE REPLACEMENT REQUEST
    // =========================================

    static async createRequest(
        customerId: string,
        orderId: string,
        itemIndex: number,
        replacementType: ReplacementType,
        customerNote = "",
    ) {

        if (
            ![
                ReplacementType.SIZE,
                ReplacementType.COLOR,
                ReplacementType.DESIGN,
            ].includes(
                replacementType,
            )
        ) {
            throw new Error(
                "Replacement is allowed only for size, color, or design change.",
            );
        }


        if (
            !Number.isInteger(itemIndex) ||
            itemIndex < 0
        ) {
            throw new Error(
                "Invalid order item.",
            );
        }


        if (
            !customerNote ||
            !customerNote.trim()
        ) {
            throw new Error(
                "Replacement reason is required.",
            );
        }


        const order =
            await Order.findOne({
                _id: orderId,
                user: customerId,
            });


        if (!order) {
            throw new Error(
                "Order not found.",
            );
        }


        if (
            order.orderStatus !==
            OrderStatus.DELIVERED
        ) {
            throw new Error(
                "Replacement can only be requested for a delivered order.",
            );
        }


        if (!order.deliveredAt) {
            throw new Error(
                "Delivery date is not available for this order.",
            );
        }


        const deliveredTime =
            new Date(
                order.deliveredAt,
            ).getTime();


        if (
            Number.isNaN(
                deliveredTime,
            )
        ) {
            throw new Error(
                "Invalid delivery date.",
            );
        }


        const replacementDeadline =
            deliveredTime +
            3 *
            24 *
            60 *
            60 *
            1000;


        if (
            Date.now() >
            replacementDeadline
        ) {
            throw new Error(
                "The 3-day replacement period has expired.",
            );
        }


        const item =
            order.items[itemIndex];


        if (!item) {
            throw new Error(
                "Order item not found.",
            );
        }


        if (!item.seller) {
            throw new Error(
                "Seller information is not available for this product.",
            );
        }


        const existingRequest =
            await ReplacementRequest.findOne({
                order: order._id,
                customer: customerId,
                orderItemIndex: itemIndex,
                status: {
                    $in: [
                        ReplacementStatus.PENDING,
                        ReplacementStatus.APPROVED,
                    ],
                },
            });


        if (existingRequest) {
            throw new Error(
                "A replacement request already exists for this item.",
            );
        }


        let currentValue = "";


        if (
            replacementType ===
            ReplacementType.SIZE
        ) {
            currentValue =
                item.variant?.size ||
                (
                    item.variant?.optionType ===
                        "size"
                        ? item.variant?.optionValue ||
                        ""
                        : ""
                );
        }


        if (
            replacementType ===
            ReplacementType.COLOR
        ) {
            currentValue =
                item.variant?.color ||
                (
                    item.variant?.optionType ===
                        "color"
                        ? item.variant?.optionValue ||
                        ""
                        : ""
                );
        }


        if (
            replacementType ===
            ReplacementType.DESIGN
        ) {
            currentValue =
                item.variant?.design ||
                (
                    item.variant?.optionType ===
                        "design"
                        ? item.variant?.optionValue ||
                        ""
                        : ""
                );
        }


        if (
            !currentValue ||
            !currentValue.trim()
        ) {
            throw new Error(
                `Current ${replacementType} value is not available for this product.`,
            );
        }


        const seller =
            await User.findOne({
                _id: item.seller,
                role: "seller",
            }).select(
                "business shopPhone phone",
            );


        if (!seller) {
            throw new Error(
                "Seller not found.",
            );
        }


        const business =
            seller.business;


        if (!business) {
            throw new Error(
                "Seller store information is not available.",
            );
        }


        let verificationBarcode =
            createUniqueBarcode(
                "VERIFY",
            );


        let duplicateBarcode =
            await ReplacementRequest.exists({
                verificationBarcode,
            });


        while (duplicateBarcode) {
            verificationBarcode =
                createUniqueBarcode(
                    "VERIFY",
                );

            duplicateBarcode =
                await ReplacementRequest.exists({
                    verificationBarcode,
                });
        }


        const request =
            await ReplacementRequest.create({

                order:
                    order._id,

                customer:
                    customerId,

                seller:
                    item.seller,

                orderItemIndex:
                    itemIndex,

                product:
                    item.product,

                replacementType,

                currentValue:
                    currentValue.trim(),

                requestedValue:
                    "",

                currentProductName:
                    item.name,

                requestedProductName:
                    "",

                originalPrice:
                    Number(
                        item.price || 0,
                    ),

                replacementPrice:
                    Number(
                        item.price || 0,
                    ),

                priceDifference:
                    0,

                sellerAddress: {

                    shopName:
                        business.shopName ||
                        "",

                    address:
                        business.address ||
                        "",

                    area:
                        business.area ||
                        "",

                    landmark:
                        business.landmark ||
                        "",

                    city:
                        business.city ||
                        "",

                    state:
                        business.state ||
                        "",

                    pincode:
                        business.pincode ||
                        "",

                    country:
                        business.country ||
                        "India",

                    phone:
                        business.shopPhone ||
                        seller.phone ||
                        "",
                },

                /*
                 * Barcode 1 is generated immediately.
                 * Barcode 2 is intentionally NOT generated yet.
                 */
                verificationBarcode,

                securityBarcode:
                    undefined,

                status:
                    ReplacementStatus.PENDING,

                customerNote:
                    customerNote.trim(),

            });


        // =========================================
        // NOTIFY SELLER
        // =========================================

        try {

            await NotificationService.create({

                userId:
                    item.seller,

                type:
                    NotificationType.REPLACEMENT_REQUESTED,

                title:
                    "New Replacement Request",

                message:
                    `A customer has submitted a replacement request for ${item.name}.`,

                orderId:
                    order._id,

                replacementId:
                    request._id,
            });

        } catch (
        notificationError
        ) {

            console.error(
                "REPLACEMENT REQUEST NOTIFICATION ERROR:",
                notificationError,
            );
        }


        return request;
    }


    // =========================================
    // GET CUSTOMER REQUESTS
    // =========================================

    static async getCustomerRequests(
        customerId: string,
    ) {

        return ReplacementRequest.find({
            customer: customerId,
        })
            .sort({
                createdAt: -1,
            })
            .populate(
                "seller",
                "name phone business",
            )
            .populate(
                "product",
                "name thumbnail",
            )
            .select(
                "+securityBarcode",
            );
    }


    // =========================================
    // GET ONE CUSTOMER REQUEST
    // =========================================

    static async getCustomerRequest(
        customerId: string,
        requestId: string,
    ) {

        if (
            !mongoose.Types.ObjectId.isValid(
                requestId,
            )
        ) {
            throw new Error(
                "Invalid replacement request ID.",
            );
        }


        return ReplacementRequest.findOne({
            _id: requestId,
            customer: customerId,
        })
            .populate(
                "seller",
                "name phone business",
            )
            .populate(
                "product",
                "name thumbnail",
            )
            .select(
                "+securityBarcode",
            );
    }


    // =========================================
    // GET SELLER REQUESTS
    // =========================================

    static async getSellerRequests(
        sellerId: string,
    ) {

        return ReplacementRequest.find({
            seller: sellerId,
        })
            .sort({
                createdAt: -1,
            })
            .populate(
                "customer",
                "name phone email",
            )
            .populate(
                "product",
                "name thumbnail",
            )
            .select(
                "+securityBarcode",
            );
    }


    // =========================================
    // FIND SELLER REQUEST
    // Barcode 1 can be used to find a request.
    // Order ID is retained as a fallback.
    // =========================================

    static async getSellerRequestByBarcode(
        sellerId: string,
        barcode: string,
    ) {

        const cleanBarcode =
            String(
                barcode,
            ).trim();


        if (!cleanBarcode) {
            throw new Error(
                "Barcode is required.",
            );
        }


        let request: any =
            await ReplacementRequest.findOne({
                seller: sellerId,
                verificationBarcode:
                    cleanBarcode,
            })
                .populate(
                    "customer",
                    "name phone email",
                )
                .populate(
                    "product",
                    "name thumbnail",
                )
                .select(
                    "+securityBarcode",
                );


        /*
         * Fallback: allow seller to search by order ID.
         * This does NOT replace Barcode 1.
         */
        if (
            !request &&
            mongoose.Types.ObjectId.isValid(
                cleanBarcode,
            )
        ) {

            request =
                await ReplacementRequest.findOne({

                    seller: sellerId,

                    order:
                        cleanBarcode,

                })
                    .populate(
                        "customer",
                        "name phone email",
                    )
                    .populate(
                        "product",
                        "name thumbnail",
                    )
                    .select(
                        "+securityBarcode",
                    );
        }


        if (!request) {
            throw new Error(
                "Replacement request not found.",
            );
        }


        return request;
    }


    // =========================================
    // APPROVE REPLACEMENT
    // Generates Barcode 2 automatically.
    // Also repairs old requests that were created
    // before Barcode 1 was added to the schema.
    // =========================================

    static async approve(
        sellerId: string,
        requestId: string,
        sellerNote = "",
    ) {

        if (
            !mongoose.Types.ObjectId.isValid(
                requestId,
            )
        ) {
            throw new Error(
                "Invalid replacement request ID.",
            );
        }


        const request =
            await ReplacementRequest.findOne({
                _id: requestId,
                seller: sellerId,
            })
                .select(
                    "+securityBarcode",
                );


        if (!request) {
            throw new Error(
                "Replacement request not found.",
            );
        }


        if (
            request.status !==
            ReplacementStatus.PENDING
        ) {
            throw new Error(
                "Only pending replacement requests can be approved.",
            );
        }


        // =====================================
        // ENSURE BARCODE 1 EXISTS
        // =====================================
        //
        // Older replacement requests may have been
        // created before verificationBarcode was added.
        // Generate a unique Barcode 1 for those requests
        // before saving the document.
        //

        if (
            !request.verificationBarcode
        ) {

            let verificationBarcode =
                createUniqueBarcode(
                    "VERIFY",
                );


            let duplicateVerificationBarcode =
                await ReplacementRequest.exists({
                    verificationBarcode,
                });


            while (
                duplicateVerificationBarcode
            ) {

                verificationBarcode =
                    createUniqueBarcode(
                        "VERIFY",
                    );

                duplicateVerificationBarcode =
                    await ReplacementRequest.exists({
                        verificationBarcode,
                    });
            }


            request.verificationBarcode =
                verificationBarcode;
        }


        // =====================================
        // GENERATE BARCODE 2
        // =====================================

        let securityBarcode =
            createUniqueBarcode(
                "SECURITY",
            );


        let duplicateBarcode =
            await ReplacementRequest.exists({
                securityBarcode,
            });


        while (duplicateBarcode) {

            securityBarcode =
                createUniqueBarcode(
                    "SECURITY",
                );

            duplicateBarcode =
                await ReplacementRequest.exists({
                    securityBarcode,
                });
        }


        (
            request as any
        ).securityBarcode =
            securityBarcode;

        request.status =
            ReplacementStatus.APPROVED;

        request.approvedAt =
            new Date();

        request.rejectedAt =
            undefined;

        request.sellerNote =
            sellerNote.trim();


        await request.save();


        // =========================================
        // NOTIFY CUSTOMER
        // =========================================

        try {

            await NotificationService.create({

                userId:
                    request.customer,

                type:
                    NotificationType.REPLACEMENT_APPROVED,

                title:
                    "Replacement Approved",

                message:
                    `Your replacement request for ${request.currentProductName} has been approved.`,

                orderId:
                    request.order,

                replacementId:
                    request._id,
            });

        } catch (
        notificationError
        ) {

            console.error(
                "REPLACEMENT APPROVAL NOTIFICATION ERROR:",
                notificationError,
            );
        }




        return ReplacementRequest.findById(
            request._id,
        )
            .populate(
                "customer",
                "name phone email",
            )
            .populate(
                "product",
                "name thumbnail",
            )
            .select(
                "+securityBarcode",
            );
    }


    // =========================================
    // REJECT REPLACEMENT
    // =========================================

    static async reject(
        sellerId: string,
        requestId: string,
        sellerNote = "",
    ) {

        if (
            !mongoose.Types.ObjectId.isValid(
                requestId,
            )
        ) {
            throw new Error(
                "Invalid replacement request ID.",
            );
        }


        const request =
            await ReplacementRequest.findOne({
                _id: requestId,
                seller: sellerId,
            });


        if (!request) {
            throw new Error(
                "Replacement request not found.",
            );
        }


        if (
            request.status !==
            ReplacementStatus.PENDING
        ) {
            throw new Error(
                "Only pending replacement requests can be rejected.",
            );
        }


        request.status =
            ReplacementStatus.REJECTED;

        request.rejectedAt =
            new Date();

        request.sellerNote =
            sellerNote.trim();


        await request.save();


        // =========================================
        // NOTIFY CUSTOMER
        // =========================================

        try {

            await NotificationService.create({

                userId:
                    request.customer,

                type:
                    NotificationType.REPLACEMENT_REJECTED,

                title:
                    "Replacement Rejected",

                message:
                    request.sellerNote
                        ? `Your replacement request was rejected. ${request.sellerNote}`
                        : "Your replacement request was rejected by the seller.",

                orderId:
                    request.order,

                replacementId:
                    request._id,
            });

        } catch (
        notificationError
        ) {

            console.error(
                "REPLACEMENT REJECTION NOTIFICATION ERROR:",
                notificationError,
            );
        }




        return request;
    }


    // =========================================
    // COMPLETE USING BARCODE 2
    // =========================================

    static async complete(
        sellerId: string,
        requestId: string,
        securityBarcode: string,
    ) {

        if (
            !mongoose.Types.ObjectId.isValid(
                requestId,
            )
        ) {
            throw new Error(
                "Invalid replacement request ID.",
            );
        }


        const cleanSecurityBarcode =
            String(
                securityBarcode,
            ).trim();


        if (!cleanSecurityBarcode) {
            throw new Error(
                "Security barcode is required.",
            );
        }


        const request =
            await ReplacementRequest.findOne({
                _id: requestId,
                seller: sellerId,
            })
                .select(
                    "+securityBarcode",
                );


        if (!request) {
            throw new Error(
                "Replacement request not found.",
            );
        }


        if (
            request.status !==
            ReplacementStatus.APPROVED
        ) {
            throw new Error(
                "Only an approved replacement can be completed.",
            );
        }


        if (
            !request.securityBarcode
        ) {
            throw new Error(
                "Security barcode has not been generated.",
            );
        }


        if (
            String(
                (
                    request as any
                ).securityBarcode ||
                "",
            ) !==
            cleanSecurityBarcode
        ) {
            throw new Error(
                "Invalid security barcode.",
            );
        }


        /*
         * The security barcode is single-use because
         * the request changes from approved -> completed.
         */
        request.status =
            ReplacementStatus.COMPLETED;

        request.completedAt =
            new Date();


        await request.save();


        // =========================================
        // NOTIFY CUSTOMER
        // =========================================

        try {

            await NotificationService.create({

                userId:
                    request.customer,

                type:
                    NotificationType.REPLACEMENT_COMPLETED,

                title:
                    "Replacement Completed",

                message:
                    `Your replacement for ${request.currentProductName} has been completed successfully.`,

                orderId:
                    request.order,

                replacementId:
                    request._id,
            });

        } catch (
        notificationError
        ) {

            console.error(
                "REPLACEMENT COMPLETION NOTIFICATION ERROR:",
                notificationError,
            );
        }




        return ReplacementRequest.findById(
            request._id,
        )
            .populate(
                "customer",
                "name phone email",
            )
            .populate(
                "product",
                "name thumbnail",
            )
            .select(
                "+securityBarcode",
            );
    }
}