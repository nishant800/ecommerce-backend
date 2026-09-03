import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import { AddressService } from "./address.service.js";

export class AddressController {
    // Create Address
    static async create(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;

            const address = await AddressService.create(
                userId,
                req.body
            );

            return res.status(201).json({
                success: true,
                data: address,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Get All Addresses
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;

            const addresses = await AddressService.getAll(userId);

            return res.json({
                success: true,
                data: addresses,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Update Address
    static async update(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;

            const address = await AddressService.update(
                userId,
                String(req.params.id),
                req.body
            );

            if (!address) {
                return res.status(404).json({
                    success: false,
                    message: "Address not found",
                });
            }

            return res.json({
                success: true,
                data: address,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Delete Address
    static async delete(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;

            const address = await AddressService.delete(
                userId,
                String(req.params.id)
            );

            if (!address) {
                return res.status(404).json({
                    success: false,
                    message: "Address not found",
                });
            }

            return res.json({
                success: true,
                message: "Address deleted successfully",
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Set Default Address
    static async setDefault(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;

            const address = await AddressService.setDefault(
                userId,
                String(req.params.id)
            );

            if (!address) {
                return res.status(404).json({
                    success: false,
                    message: "Address not found",
                });
            }

            return res.json({
                success: true,
                data: address,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }
}