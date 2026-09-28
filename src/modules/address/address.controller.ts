import { Response } from "express";
import {
    AuthRequest,
} from "../../middleware/auth.middleware.js";
import {
    AddressService,
} from "./address.service.js";
export class AddressController {
    // =========================================
    // CREATE ADDRESS
    // =========================================
    static async create(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId =
                req.user!.userId;
            const address =
                await AddressService.create(
                    userId,
                    req.body
                );
            return res.status(201).json({
                success: true,
                message:
                    "Address added successfully",
                data: address,
            });
        } catch (error: any) {
            console.error(
                "CREATE ADDRESS ERROR:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error?.message ||
                    "Unable to add address",
            });
        }
    }
    // =========================================
    // GET ALL ADDRESSES
    // =========================================
    static async getAll(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId =
                req.user!.userId;
            const addresses =
                await AddressService.getAll(
                    userId
                );
            return res.status(200).json({
                success: true,
                data: addresses,
            });
        } catch (error: any) {
            console.error(
                "GET ADDRESSES ERROR:",
                error
            );
            return res.status(500).json({
                success: false,
                message:
                    error?.message ||
                    "Unable to load addresses",
            });
        }
    }
    // =========================================
    // GET SINGLE ADDRESS
    // =========================================
    static async getById(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId =
                req.user!.userId;
            const address =
                await AddressService.getById(
                    userId,
                    String(req.params.id)
                );
            if (!address) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Address not found",
                });
            }
            return res.status(200).json({
                success: true,
                data: address,
            });
        } catch (error: any) {
            console.error(
                "GET ADDRESS ERROR:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error?.message ||
                    "Unable to load address",
            });
        }
    }
    // =========================================
    // UPDATE ADDRESS
    // =========================================
    static async update(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId =
                req.user!.userId;
            const address =
                await AddressService.update(
                    userId,
                    String(req.params.id),
                    req.body
                );
            if (!address) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Address not found",
                });
            }
            return res.status(200).json({
                success: true,
                message:
                    "Address updated successfully",
                data: address,
            });
        } catch (error: any) {
            console.error(
                "UPDATE ADDRESS ERROR:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error?.message ||
                    "Unable to update address",
            });
        }
    }
    // =========================================
    // DELETE ADDRESS
    // =========================================
    static async delete(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId =
                req.user!.userId;
            const address =
                await AddressService.delete(
                    userId,
                    String(req.params.id)
                );
            if (!address) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Address not found",
                });
            }
            return res.status(200).json({
                success: true,
                message:
                    "Address deleted successfully",
            });
        } catch (error: any) {
            console.error(
                "DELETE ADDRESS ERROR:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error?.message ||
                    "Unable to delete address",
            });
        }
    }
    // =========================================
    // SET DEFAULT ADDRESS
    // =========================================
    static async setDefault(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId =
                req.user!.userId;
            const address =
                await AddressService.setDefault(
                    userId,
                    String(req.params.id)
                );
            if (!address) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Address not found",
                });
            }
            return res.status(200).json({
                success: true,
                message:
                    "Default address updated successfully",
                data: address,
            });
        } catch (error: any) {
            console.error(
                "SET DEFAULT ADDRESS ERROR:",
                error
            );
            return res.status(400).json({
                success: false,
                message:
                    error?.message ||
                    "Unable to set default address",
            });
        }
    }
}