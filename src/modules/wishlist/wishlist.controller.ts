import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import { WishlistService } from "./wishlist.service.js";

export class WishlistController {
    // =========================================
    // GET WISHLIST
    // =========================================

    static async getWishlist(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId = req.user!.userId;

            const wishlist =
                await WishlistService.getWishlist(userId);

            return res.json({
                success: true,
                data: wishlist,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    // =========================================
    // ADD PRODUCT
    // =========================================

    static async addProduct(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId = req.user!.userId;
            const { productId } = req.body;

            const wishlist =
                await WishlistService.addProduct(
                    userId,
                    productId
                );

            return res.status(201).json({
                success: true,
                data: wishlist,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    // =========================================
    // REMOVE PRODUCT
    // =========================================

    static async removeProduct(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId = req.user!.userId;

            const productId = String(
                req.params.productId
            );

            const wishlist =
                await WishlistService.removeProduct(
                    userId,
                    productId
                );

            return res.json({
                success: true,
                data: wishlist,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    // =========================================
    // TOGGLE PRODUCT
    // =========================================

    static async toggleProduct(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId = req.user!.userId;
            const { productId } = req.body;

            const wishlist =
                await WishlistService.toggleProduct(
                    userId,
                    productId
                );

            return res.json({
                success: true,
                data: wishlist,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }
}