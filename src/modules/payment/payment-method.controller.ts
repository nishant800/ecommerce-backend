import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import { PaymentMethodService } from "./payment-method.service.js";
export class PaymentMethodController {
    static async getMethods(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.userId;
            if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
            const methods = await PaymentMethodService.getMethods(userId);
            return res.json({ success: true, data: methods });
        } catch (error: any) {
            console.error("GET PAYMENT METHODS ERROR:", error);
            return res.status(500).json({
                success: false,
                message: error?.message || "Unable to load payment methods.",
            });
        }
    }
    static async addMethod(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.userId;
            if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
            const method = await PaymentMethodService.addMethod(userId, req.body);
            return res.status(201).json({
                success: true,
                message: "Payment method added successfully.",
                data: method,
            });
        } catch (error: any) {
            console.error("ADD PAYMENT METHOD ERROR:", error);
            return res.status(400).json({
                success: false,
                message: error?.message || "Unable to add payment method.",
            });
        }
    }
    static async setDefault(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.userId;
            if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
            const method = await PaymentMethodService.setDefault(
                userId,
                String(req.params.id),
            ); return res.json({ success: true, message: "Default payment method updated.", data: method });
        } catch (error: any) {
            console.error("SET DEFAULT PAYMENT METHOD ERROR:", error);
            return res.status(400).json({
                success: false,
                message: error?.message || "Unable to update default payment method.",
            });
        }
    }
    static async deleteMethod(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.userId;
            if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
            await PaymentMethodService.deleteMethod(
                userId,
                String(req.params.id),
            ); return res.json({ success: true, message: "Payment method removed successfully." });
        } catch (error: any) {
            console.error("DELETE PAYMENT METHOD ERROR:", error);
            return res.status(400).json({
                success: false,
                message: error?.message || "Unable to remove payment method.",
            });
        }
    }
}
