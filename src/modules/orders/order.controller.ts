import { Response } from "express";

import Order from "./order.model.js";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import { OrderService } from "./order.service.js";
import Product from "../products/product.model.js";
import mongoose from "mongoose";

import {
    NotificationService,
} from "../../notifications/notification.service.js";

import {
    NotificationType,
    NotificationRecipientRole,
} from "../../notifications/notification.model.js";


const getVariantChildStock = (
    variant: any,
    item: any,
) => {

    const optionType =
        String(
            item.optionType ||
            item.variant?.optionType ||
            ''
        )
            .trim()
            .toLowerCase();

    const optionValue =
        String(
            item.optionValue ||
            item.variant?.optionValue ||
            ''
        ).trim();

    if (optionType === "size" && optionValue) {
        const option =
            variant?.sizes?.find(
                (entry: any) =>
                    String(entry.size).trim().toLowerCase() ===
                    String(optionValue).trim().toLowerCase(),
            );

        return {
            option,
            stock: Number(option?.stock || 0),
        };
    }

    if (optionType === "shade" && optionValue) {
        const option =
            variant?.shades?.find(
                (entry: any) =>
                    String(entry.shade).trim().toLowerCase() ===
                    String(optionValue).trim().toLowerCase(),
            );

        return {
            option,
            stock: Number(option?.stock || 0),
        };
    }

    if (optionType === "color" && optionValue) {
        const option =
            variant?.colors?.find(
                (entry: any) =>
                    String(entry.color).trim().toLowerCase() ===
                    String(optionValue).trim().toLowerCase(),
            );

        return {
            option,
            stock: Number(option?.stock || 0),
        };
    }

    return {
        option: null,
        stock: Number(variant?.stock || 0),
    };
};

const recalculateVariantStock = (
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

    return Number(variant?.stock || 0);
};

const deductVariantChildStock = (
    variant: any,
    item: any,
    quantity: number,
) => {

    const selected =
        getVariantChildStock(
            variant,
            item,
        );

    if (selected.option) {
        selected.option.stock =
            Math.max(
                0,
                Number(selected.option.stock || 0) -
                quantity,
            );

        variant.stock =
            recalculateVariantStock(
                variant,
            );

        return;
    }

    variant.stock =
        Math.max(
            0,
            Number(variant.stock || 0) -
            quantity,
        );
};



// =========================================
// CREATE ORDER
// =========================================

export const createOrder = async (
    req: AuthRequest,
    res: Response
) => {

    let session: mongoose.ClientSession | null = null;

    try {

        const userId =
            req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // =========================================
        // REQUEST DATA
        // =========================================

        const {
            items,
            shippingAddress,
            paymentMethod,
        } = req.body;

        // =========================================
        // BASIC VALIDATION
        // =========================================

        if (
            !Array.isArray(items) ||
            items.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Cart is empty",
            });
        }

        if (!shippingAddress) {
            return res.status(400).json({
                success: false,
                message:
                    "Shipping address is required",
            });
        }

        // =========================================
        // MARKETPLACE DELIVERY AREA
        // =========================================

        const normalizedDeliveryCity =
            String(shippingAddress.city || "")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();

        const deliveryPincode =
            String(
                shippingAddress.pincode || ""
            ).trim();

        const allowedDeliveryPincodes = [
            "444001",
            "444002",
        ];

        if (
            normalizedDeliveryCity !== "akola" ||
            !allowedDeliveryPincodes.includes(
                deliveryPincode
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Delivery is currently available only in Akola (444001 and 444002). Please select an eligible delivery address to continue.",
            });
        }

        // =========================================
        // START DATABASE TRANSACTION
        // =========================================
        //
        // Order creation and stock deduction happen
        // in the same transaction. This prevents:
        //
        // Order created + stock not deducted
        //
        // and protects against two customers buying
        // the same last item simultaneously.
        // =========================================

        session =
            await mongoose.startSession();

        session.startTransaction();

        // =========================================
        // BUILD ORDER ITEMS
        // =========================================

        const orderItems: any[] = [];

        let basePriceTotal = 0;
        let subtotalCalculated = 0;

        // =========================================
        // CHECK EVERY PRODUCT
        // =========================================

        for (const item of items) {

            // -------------------------------------
            // PRODUCT ID
            // -------------------------------------

            if (!item?.product) {
                throw new Error(
                    "Product ID is missing from order item"
                );
            }

            // -------------------------------------
            // QUANTITY
            // -------------------------------------

            const quantity =
                Number(item.quantity) || 0;

            if (
                !Number.isInteger(quantity) ||
                quantity < 1
            ) {
                throw new Error(
                    "Invalid quantity for order item"
                );
            }

            // -------------------------------------
            // GET PRODUCT INSIDE TRANSACTION
            // -------------------------------------

            const product =
                await Product.findById(
                    item.product
                ).session(session);

            if (!product) {
                throw new Error(
                    `Product not found: ${item.product}`
                );
            }

            if (!product.active) {
                throw new Error(
                    `Product ${product.name} is no longer available`,
                );
            }

            // -------------------------------------
            // SELLER
            // -------------------------------------

            if (!product.seller) {
                throw new Error(
                    `Product "${product.name}" does not have a seller assigned.`
                );
            }

            // =====================================
            // FIND SELECTED VARIANT FROM DATABASE
            // =====================================

            let selectedVariant: any = null;

            if (item?.variant?.sku) {

                selectedVariant =
                    product.variants?.find(
                        (variant: any) =>
                            String(
                                variant.sku
                            ) ===
                            String(
                                item.variant.sku
                            )
                    );

                if (!selectedVariant) {
                    throw new Error(
                        `Variant ${item.variant.sku} not found for ${product.name}`
                    );
                }

                if (selectedVariant.active === false) {
                    throw new Error(
                        `Selected variant is no longer available for ${product.name}`,
                    );
                }

                // =================================
                // CHECK EXACT VARIANT/CHILD STOCK
                // =================================

                const selectedStock =
                    getVariantChildStock(
                        selectedVariant,
                        item
                    );

                if (
                    selectedStock.stock <
                    quantity
                ) {

                    const optionLabel =
                        item.optionType &&
                            item.optionValue
                            ? `${item.optionType} ${item.optionValue}`
                            : `variant ${selectedVariant.sku}`;

                    throw new Error(
                        `${product.name} (${optionLabel}) has only ${selectedStock.stock} items in stock.`
                    );
                }
            }

            // =====================================
            // SERVER-AUTHORITATIVE PRICE
            // =====================================
            //
            // NEVER use price/discount values sent
            // by the customer app.
            //
            // For a selected variant, use the
            // variant price stored in MongoDB.
            //
            // For a normal product, use the product
            // price/discount price stored in MongoDB.
            // =====================================

            // =====================================
            // PRICE FROM DATABASE
            // =====================================

            // MRP:
            // Use the selected variant price when it is
            // actually configured. If the variant price
            // is 0 or missing, fall back to product MRP.
            const selectedVariantPrice =
                selectedVariant
                    ? Number(
                        selectedVariant.price
                    ) || 0
                    : 0;

            const productMRP =
                Number(
                    product.price
                ) || 0;

            const basePrice =
                selectedVariantPrice > 0
                    ? selectedVariantPrice
                    : productMRP;

            if (
                !Number.isFinite(basePrice) ||
                basePrice < 0
            ) {
                throw new Error(
                    `Invalid price for ${product.name}`
                );
            }

            const productDiscountPrice =
                Number(
                    product.discountPrice
                ) || 0;

            const variantDiscountPrice =
                selectedVariant
                    ? Number(selectedVariant.discountPrice) || 0
                    : 0;

            const finalPrice =
                variantDiscountPrice > 0
                    ? variantDiscountPrice
                    : productDiscountPrice > 0
                    ? productDiscountPrice
                    : basePrice;

            if (
                !Number.isFinite(finalPrice) ||
                finalPrice < 0 ||
                finalPrice > basePrice
            ) {
                throw new Error(
                    `Invalid discount price for ${product.name}`
                );
            }

            // =====================================
            // UPDATE EXACT STOCK IN MEMORY
            // =====================================
            //
            // Because the whole operation is inside
            // a MongoDB transaction, concurrent stock
            // modifications cannot silently create a
            // second successful order.
            // =====================================

            if (selectedVariant) {

                const optionType =
                    String(
                        item.optionType ||
                        item.variant?.optionType ||
                        ""
                    ).trim().toLowerCase();

                const optionValue =
                    String(
                        item.optionValue ||
                        item.variant?.optionValue ||
                        ""
                    ).trim();

                // ---------------------------------
                // SIZE
                // ---------------------------------

                if (
                    optionType === "size" &&
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
                                ).trim()
                                    .toLowerCase() ===
                                optionValue.toLowerCase()
                        );

                    if (!option) {
                        throw new Error(
                            `Selected size is not available for ${product.name}`
                        );
                    }

                    if (
                        Number(option.stock || 0) <
                        quantity
                    ) {
                        throw new Error(
                            `${product.name} (${optionValue}) is out of stock`
                        );
                    }

                    option.stock =
                        Number(option.stock || 0) -
                        quantity;

                    selectedVariant.stock =
                        recalculateVariantStock(
                            selectedVariant
                        );
                }

                // ---------------------------------
                // SHADE
                // ---------------------------------

                else if (
                    optionType === "shade" &&
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
                                ).trim()
                                    .toLowerCase() ===
                                optionValue.toLowerCase()
                        );

                    if (!option) {
                        throw new Error(
                            `Selected shade is not available for ${product.name}`
                        );
                    }

                    if (
                        Number(option.stock || 0) <
                        quantity
                    ) {
                        throw new Error(
                            `${product.name} (${optionValue}) is out of stock`
                        );
                    }

                    option.stock =
                        Number(option.stock || 0) -
                        quantity;

                    selectedVariant.stock =
                        recalculateVariantStock(
                            selectedVariant
                        );
                }

                // ---------------------------------
                // COLOR
                // ---------------------------------

                else if (
                    optionType === "color" &&
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
                                ).trim()
                                    .toLowerCase() ===
                                optionValue.toLowerCase()
                        );

                    if (!option) {
                        throw new Error(
                            `Selected color is not available for ${product.name}`
                        );
                    }

                    if (
                        Number(option.stock || 0) <
                        quantity
                    ) {
                        throw new Error(
                            `${product.name} (${optionValue}) is out of stock`
                        );
                    }

                    option.stock =
                        Number(option.stock || 0) -
                        quantity;

                    selectedVariant.stock =
                        recalculateVariantStock(
                            selectedVariant
                        );
                }

                // ---------------------------------
                // NORMAL VARIANT STOCK
                // ---------------------------------

                else {

                    if (
                        Number(
                            selectedVariant.stock || 0
                        ) <
                        quantity
                    ) {
                        throw new Error(
                            `${product.name} is out of stock`
                        );
                    }

                    selectedVariant.stock =
                        Number(
                            selectedVariant.stock || 0
                        ) -
                        quantity;
                }

            } else {

                // ---------------------------------
                // NORMAL PRODUCT STOCK
                // ---------------------------------

                const productStock =
                    Number(
                        product.stock
                    ) || 0;

                if (
                    productStock <
                    quantity
                ) {
                    throw new Error(
                        `${product.name} has only ${productStock} items in stock.`
                    );
                }

                product.stock =
                    productStock -
                    quantity;
            }

            // =====================================
            // SAVE PRODUCT STOCK
            // =====================================

            await product.save({
                session,
            });

            // =====================================
            // TOTALS
            // =====================================

            basePriceTotal +=
                basePrice *
                quantity;

            subtotalCalculated +=
                finalPrice *
                quantity;

            // =====================================
            // BUILD DATABASE VARIANT SNAPSHOT
            // =====================================
            //
            // Do not trust variant display data sent
            // by the customer. Save values from the
            // verified database variant instead.
            // =====================================

            const variantSnapshot =
                selectedVariant
                    ? {
                        color:
                            selectedVariant.color ||
                            "",
                        size:
                            (
                                String(
                                    item?.optionType ||
                                    item?.variant?.optionType ||
                                    ""
                                ).trim().toLowerCase() ===
                                "size"
                            ) &&
                                (
                                    item?.optionValue ||
                                    item?.variant?.optionValue
                                )
                                ? String(
                                    item?.optionValue ||
                                    item?.variant?.optionValue
                                )
                                : selectedVariant.size ||
                                "",
                        design:
                            selectedVariant.design ||
                            "",
                        strap:
                            selectedVariant.strap ||
                            "",
                        style:
                            selectedVariant.style ||
                            "",
                        shade:
                            selectedVariant.shade ||
                            "",
                        volume:
                            selectedVariant.volume ||
                            "",
                        material:
                            selectedVariant.material ||
                            "",
                        sku:
                            selectedVariant.sku ||
                            "",
                        optionType:
                            item.optionType ||
                            item?.variant?.optionType ||
                            "",
                        optionValue:
                            item.optionValue ||
                            item?.variant?.optionValue ||
                            "",
                    }
                    : null;

            // =====================================
            // SELECTED VARIANT IMAGE
            // =====================================

            let selectedVariantImage = "";

            if (selectedVariant) {

                // Generic / bangle variant image.
                selectedVariantImage =
                    selectedVariant.colorImage ||
                    selectedVariant.image ||
                    selectedVariant.thumbnail ||
                    "";

                // Cosmetic shade image.
                if (
                    !selectedVariantImage &&
                    (
                        item?.optionType ||
                        item?.variant?.optionType ||
                        ""
                    ).trim().toLowerCase() === "shade" &&
                    (
                        item?.optionValue ||
                        item?.variant?.optionValue
                    )
                ) {
                    selectedVariantImage =
                        selectedVariant.shades?.find(
                            (entry: any) =>
                                String(
                                    entry.shade
                                ).trim().toLowerCase() ===
                                String(
                                    item?.optionValue ||
                                    item?.variant?.optionValue
                                ).trim().toLowerCase()
                        )?.image ||
                        "";
                }

                // Watch color image.
                if (
                    !selectedVariantImage &&
                    (
                        item?.optionType ||
                        item?.variant?.optionType ||
                        ""
                    ).trim().toLowerCase() === "color" &&
                    (
                        item?.optionValue ||
                        item?.variant?.optionValue
                    )
                ) {
                    selectedVariantImage =
                        selectedVariant.colors?.find(
                            (entry: any) =>
                                String(
                                    entry.color
                                ).trim().toLowerCase() ===
                                String(
                                    item?.optionValue ||
                                    item?.variant?.optionValue
                                ).trim().toLowerCase()
                        )?.image ||
                        "";
                }
            }

            orderItems.push({

                product:
                    product._id,

                seller:
                    product.seller,

                name:
                    product.name,

                // Selected variant image first,
                // normal product image as fallback.
                image:
                    selectedVariantImage ||
                    product.thumbnail ||
                    product.images?.[0]?.url ||
                    "",

                // Database price snapshot
                basePrice,

                // Database final price snapshot
                discountPrice:
                    finalPrice,

                price:
                    finalPrice,

                quantity,

                ...(variantSnapshot
                    ? {
                        variant:
                            variantSnapshot,
                    }
                    : {}),
            });
        }

        // =========================================
        // FINAL SERVER-SIDE PRICE CALCULATION
        // =========================================

        const calculatedsubtotal =
            subtotalCalculated;

        const calculatedDiscount =
            Math.max(
                0,
                basePriceTotal -
                calculatedsubtotal
            );

        const calculatedShippingCharge =
            calculatedsubtotal < 500
                ? 30
                : 0;

        // Tax is currently disabled in the
        // existing checkout flow.
        const calculatedTax = 0;

        const calculatedTotal =
            calculatedsubtotal +
            calculatedShippingCharge;

        // =========================================
        // CREATE ORDER INSIDE SAME TRANSACTION
        // =========================================

        const [order] =
            await Order.create(
                [
                    {
                        user:
                            userId,

                        items:
                            orderItems,

                        shippingAddress,

                        subtotal:
                            calculatedsubtotal,

                        shippingCharge:
                            calculatedShippingCharge,

                        discount:
                            calculatedDiscount,

                        tax:
                            calculatedTax,

                        total:
                            calculatedTotal,

                        paymentMethod:
                            paymentMethod ||
                            "COD",

                        paymentStatus:
                            "pending",

                        orderStatus:
                            "pending",
                    },
                ],
                {
                    session,
                }
            );

        // =========================================
        // COMMIT
        // =========================================

        await session.commitTransaction();

        // =========================================
        // CREATE ORDER NOTIFICATIONS
        // =========================================
        //
        // Notifications are created only after the
        // order transaction has successfully committed.
        // A notification failure must never undo a
        // successful order.
        // =========================================

        try {

            await NotificationService.create({

                userId:
                    userId,

                recipientRole:
                    NotificationRecipientRole.CUSTOMER,

                type:
                    NotificationType.ORDER_PLACED,

                title:
                    "Order Placed",

                message:
                    `Your order #${order._id
                        .toString()
                        .slice(-8)} has been placed successfully.`,

                orderId:
                    order._id,
            });


            const sellerIds =
                [
                    ...new Set(
                        orderItems
                            .map(
                                item =>
                                    item.seller
                                        ?.toString(),
                            )
                            .filter(
                                Boolean,
                            ),
                    ),
                ];


            await Promise.all(
                sellerIds.map(
                    sellerId =>
                        NotificationService.create({

                            userId:
                                sellerId,

                            recipientRole:
                                NotificationRecipientRole.SELLER,

                            type:
                                NotificationType.NEW_ORDER,

                            title:
                                "New Order Received",

                            message:
                                `You have received a new order #${order._id
                                    .toString()
                                    .slice(-8)}.`,

                            orderId:
                                order._id,
                        })
                ),
            );

        } catch (
        notificationError
        ) {

            console.error(
                "ORDER NOTIFICATION ERROR:",
                notificationError,
            );
        }


        console.log(
            "ORDER CREATED:",
            order._id.toString()
        );

        console.log(
            "ORDER PRICING:",
            {
                basePriceTotal,
                subtotal:
                    calculatedsubtotal,
                discount:
                    calculatedDiscount,
                shippingCharge:
                    calculatedShippingCharge,
                tax:
                    calculatedTax,
                total:
                    calculatedTotal,
            }
        );

        // =========================================
        // RESPONSE
        // =========================================

        return res.status(201).json({

            success:
                true,

            message:
                "Order created successfully",

            data:
                order,
        });

    } catch (error: any) {

        if (session) {
            try {
                await session.abortTransaction();
            } catch {
                // Ignore abort errors.
            }
        }

        console.error(
            "CREATE ORDER ERROR:",
            error
        );

        return res.status(
            error?.message?.includes(
                "out of stock"
            ) ||
                error?.message?.includes(
                    "only"
                )
                ? 400
                : 500
        ).json({

            success:
                false,

            message:
                error?.message ||
                "Failed to create order",
        });

    } finally {

        if (session) {
            await session.endSession();
        }
    }
};


// =========================================
// ORDER CONTROLLER
// =========================================

export class OrderController {


    // =========================================
    // GET MY ORDERS
    // =========================================

    static async getMyOrders(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const userId =
                req.user?.userId;


            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Unauthorized",
                });
            }


            const orders =
                await OrderService.getMyOrders(
                    userId
                );


            return res.json({

                success:
                    true,

                data:
                    orders,
            });


        } catch (error: any) {

            console.error(
                "GET MY ORDERS ERROR:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    error?.message ||
                    "Failed to load orders",
            });
        }
    }



    // =========================================
    // GET ORDER DETAILS
    // =========================================

    static async getOrder(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const userId =
                req.user?.userId;


            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Unauthorized",
                });
            }


            const order =
                await OrderService.getOrder(
                    userId,
                    String(
                        req.params.id
                    )
                );


            if (!order) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Order not found",
                });
            }


            return res.json({

                success:
                    true,

                data:
                    order,
            });


        } catch (error: any) {

            console.error(
                "GET ORDER ERROR:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    error?.message ||
                    "Failed to load order",
            });
        }
    }



    // =========================================
    // CANCEL ORDER
    // =========================================

    static async cancel(
        req: AuthRequest,
        res: Response
    ) {

        try {

            const userId =
                req.user?.userId;


            if (!userId) {

                return res.status(401).json({

                    success:
                        false,

                    message:
                        "Unauthorized",
                });
            }


            const order =
                await OrderService.cancelOrder(
                    userId,
                    String(
                        req.params.id
                    )
                );


            if (!order) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Order not found",
                });
            }


            return res.json({

                success:
                    true,

                data:
                    order,
            });


        } catch (error: any) {

            console.error(
                "CANCEL ORDER ERROR:",
                error
            );


            return res.status(400).json({

                success:
                    false,

                message:
                    error?.message ||
                    "Failed to cancel order",
            });
        }
    }
}
