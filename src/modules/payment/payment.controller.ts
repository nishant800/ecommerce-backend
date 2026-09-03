import { Response } from "express";
import { PaymentService } from "./payment.service.js";
import { AuthRequest } from "../../middleware/auth.middleware.js";

export class PaymentController {
    static async createPayment(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const { orderId } = req.body;

            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    message: "Order ID is required",
                });
            }

            const result =
                await PaymentService.createPayment(
                    orderId,
                    userId
                );

            return res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            console.error(
                "PAYMENT ERROR:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error?.message ||
                    "Something went wrong",
            });
        }
    }

    static async verifyPayment(
        req: AuthRequest,
        res: Response
    ) {
        try {
            const userId =
                req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            const order =
                await PaymentService.verifyPayment(
                    req.body,
                    userId
                );

            return res.json({
                success: true,
                data: order,
            });

        } catch (error: any) {
            console.error(
                "VERIFY PAYMENT ERROR:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error?.message ||
                    "Payment verification failed",
            });
        }
    }
}