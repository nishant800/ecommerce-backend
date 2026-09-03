import { Response } from "express";

import { AuthRequest } from "../../middleware/auth.middleware.js";

import { SellerService } from "./seller.service.js";

export class SellerController {

    // =========================================
    // DASHBOARD
    // =========================================

    static async dashboard(
        req: AuthRequest,
        res: Response
    ) {
        try {

            const sellerId =
                req.user?.userId;

            if (!sellerId) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Unauthorized",
                });
            }

            const dashboard =
                await SellerService.getDashboard(
                    sellerId
                );

            return res.json({
                success: true,
                data: dashboard,
            });

        } catch (error: any) {

            console.error(
                "Seller Dashboard Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load seller dashboard",
            });
        }
    }


    // =========================================
    // ORDERS
    // =========================================

    static async orders(
        req: AuthRequest,
        res: Response
    ) {
        try {

            const sellerId =
                req.user?.userId;

            if (!sellerId) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Unauthorized",
                });
            }

            const orders =
                await SellerService.getOrders(
                    sellerId
                );

            return res.json({
                success: true,
                data: orders,
            });

        } catch (error: any) {

            console.error(
                "Seller Orders Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load orders",
            });
        }
    }


    // =========================================
    // ORDER DETAILS
    // =========================================

    static async order(
        req: AuthRequest,
        res: Response
    ) {
        try {

            const sellerId =
                req.user?.userId;

            if (!sellerId) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Unauthorized",
                });
            }

            const order =
                await SellerService.getOrder(
                    sellerId,
                    String(req.params.id)
                );

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Order not found",
                });
            }

            return res.json({
                success: true,
                data: order,
            });

        } catch (error: any) {

            console.error(
                "Seller Order Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load order",
            });
        }
    }


    // =========================================
    // UPDATE ORDER STATUS
    // =========================================

    static async updateOrderStatus(
        req: AuthRequest,
        res: Response
    ) {
        try {

            const sellerId =
                req.user?.userId;

            if (!sellerId) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Unauthorized",
                });
            }

            const { status } =
                req.body;

            if (!status) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Order status is required",
                });
            }

            const order =
                await SellerService.updateOrderStatus(
                    sellerId,
                    String(req.params.id),
                    status
                );

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Order not found or does not belong to this seller",
                });
            }

            return res.json({
                success: true,

                message:
                    "Order status updated successfully",

                data: order,
            });

        } catch (error: any) {

            console.error(
                "Update Order Status Error:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message,
            });
        }
    }
    // =========================================
    // MARK ORDER SHIPPED AFTER LABEL GENERATION
    // =========================================

    static async markOrderShippedAfterLabel(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const sellerId =
                req.user?.userId;

            if (!sellerId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const order =
                await SellerService.markOrderShippedAfterLabel(
                    sellerId,
                    String(req.params.id)
                );

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Pending order not found or does not belong to this seller",
                });
            }

            return res.json({
                success: true,
                message:
                    "Order marked as shipped",
                data: order,
            });

        } catch (error: any) {
            console.error(
                "MARK ORDER SHIPPED ERROR:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Failed to mark order as shipped",
            });
        }
    }
    // =========================================
    // SELLER PROFILE
    // =========================================

    static async profile(
        req: AuthRequest,
        res: Response
    ) {
        try {

            const sellerId =
                req.user?.userId;

            if (!sellerId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const seller =
                await SellerService.getProfile(
                    sellerId
                );

            if (!seller) {
                return res.status(404).json({
                    success: false,
                    message: "Seller profile not found",
                });
            }

            return res.json({
                success: true,
                data: seller,
            });

        } catch (error: any) {

            console.error(
                "Seller Profile Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load seller profile",
            });
        }
    }


    // =========================================
    // UPDATE SELLER PROFILE
    // =========================================

    static async updateProfile(
        req: AuthRequest,
        res: Response
    ) {
        try {

            const sellerId =
                req.user?.userId;

            if (!sellerId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const seller =
                await SellerService.updateProfile(
                    sellerId,
                    req.body
                );

            if (!seller) {
                return res.status(404).json({
                    success: false,
                    message: "Seller profile not found",
                });
            }

            return res.json({
                success: true,
                message:
                    "Seller profile updated successfully",
                data: seller,
            });

        } catch (error: any) {

            console.error(
                "Update Seller Profile Error:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Failed to update seller profile",
            });
        }
    }


    // =========================================
    // DELETE SELLER ACCOUNT
    // =========================================

    static async deleteAccount(
        req: AuthRequest,
        res: Response
    ) {
        try {

            const sellerId =
                req.user?.userId;

            if (!sellerId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const seller =
                await SellerService.deleteAccount(
                    sellerId
                );

            if (!seller) {
                return res.status(404).json({
                    success: false,
                    message: "Seller account not found",
                });
            }

            return res.json({
                success: true,
                message:
                    "Seller account deleted successfully",
            });

        } catch (error: any) {

            console.error(
                "Delete Seller Account Error:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Failed to delete seller account",
            });
        }
    }
}