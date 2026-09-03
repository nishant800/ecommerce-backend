import { Response } from "express";

import {
    AuthRequest,
} from "../../middleware/auth.middleware.js";

import {
    CartService,
} from "./cart.service.js";

export class CartController {

    // =========================================
    // GET CART
    // =========================================

    static async getCart(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const userId =
                req.user!.userId;


            const cart =
                await CartService.getCart(
                    userId,
                );


            return res.json({
                success: true,
                data: cart,
            });

        } catch (
        error: any
        ) {

            return res.status(
                500,
            ).json({
                success: false,
                message:
                    error.message,
            });

        }
    }


    // =========================================
    // ADD TO CART
    // =========================================

    static async addToCart(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const userId =
                req.user!.userId;


            const {
                productId,
                quantity,
                variantId,
                optionType,
                optionValue,
            } = req.body;


            if (!productId) {

                return res.status(
                    400,
                ).json({
                    success: false,
                    message:
                        "Product ID is required",
                });

            }


            const cart =
                await CartService.addToCart(
                    userId,
                    String(productId),
                    Number(
                        quantity || 1,
                    ),
                    {
                        variantId:
                            variantId
                                ? String(
                                    variantId,
                                )
                                : undefined,

                        optionType:
                            optionType
                                ? String(
                                    optionType,
                                ) as
                                | "size"
                                | "shade"
                                | "color"
                                | ""
                                : "",

                        optionValue:
                            optionValue
                                ? String(
                                    optionValue,
                                )
                                : "",
                    },
                );


            return res.status(
                201,
            ).json({
                success: true,
                data: cart,
            });

        } catch (
        error: any
        ) {

            return res.status(
                400,
            ).json({
                success: false,
                message:
                    error.message,
            });

        }
    }


    // =========================================
    // UPDATE QUANTITY
    // =========================================

    static async updateQuantity(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const userId =
                req.user!.userId;


            const {
                productId,
                quantity,
                variantId,
                optionType,
                optionValue,
            } = req.body;


            const cart =
                await CartService.updateQuantity(
                    userId,
                    String(productId),
                    Number(quantity),
                    {
                        variantId:
                            variantId
                                ? String(
                                    variantId,
                                )
                                : undefined,

                        optionType:
                            optionType
                                ? String(
                                    optionType,
                                ) as
                                | "size"
                                | "shade"
                                | "color"
                                | ""
                                : "",

                        optionValue:
                            optionValue
                                ? String(
                                    optionValue,
                                )
                                : "",
                    },
                );


            return res.json({
                success: true,
                data: cart,
            });

        } catch (
        error: any
        ) {

            return res.status(
                400,
            ).json({
                success: false,
                message:
                    error.message,
            });

        }
    }


    // =========================================
    // REMOVE ITEM
    // =========================================

    static async removeItem(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const userId =
                req.user!.userId;


            const {
                variantId,
                optionType,
                optionValue,
            } = req.body || {};


            const productId =
                String(
                    req.params.productId,
                );


            const cart =
                await CartService.removeItem(
                    userId,
                    productId,
                    {
                        variantId:
                            variantId
                                ? String(
                                    variantId,
                                )
                                : undefined,

                        optionType:
                            optionType
                                ? String(
                                    optionType,
                                ) as
                                | "size"
                                | "shade"
                                | "color"
                                | ""
                                : "",

                        optionValue:
                            optionValue
                                ? String(
                                    optionValue,
                                )
                                : "",
                    },
                );


            return res.json({
                success: true,
                data: cart,
            });

        } catch (
        error: any
        ) {

            return res.status(
                400,
            ).json({
                success: false,
                message:
                    error.message,
            });

        }
    }


    // =========================================
    // CLEAR CART
    // =========================================

    static async clearCart(
        req: AuthRequest,
        res: Response,
    ) {

        try {

            const userId =
                req.user!.userId;


            const cart =
                await CartService.clearCart(
                    userId,
                );


            return res.json({
                success: true,
                data: cart,
            });

        } catch (
        error: any
        ) {

            return res.status(
                400,
            ).json({
                success: false,
                message:
                    error.message,
            });

        }
    }
}