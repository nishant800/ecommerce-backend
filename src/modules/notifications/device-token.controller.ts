import { Response } from "express";
import User from "../users/user.model.js";
import {
    AuthRequest,
} from "../../middleware/auth.middleware.js";
export class DeviceTokenController {
    // =========================================
    // REGISTER / UPDATE FCM DEVICE TOKEN
    // =========================================
    static async register(
        req: AuthRequest,
        res: Response,
    ) {
        try {
            const userId =
                req.user?.userId;
            const token =
                String(
                    req.body?.token || "",
                ).trim();
            const platform =
                req.body?.platform === "ios"
                    ? "ios"
                    : "android";
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }
            if (
                !token ||
                token.length < 20
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "A valid FCM device token is required",
                });
            }
            // =====================================
            // REMOVE TOKEN FROM OTHER ACCOUNTS
            // =====================================
            await User.updateMany(
                {
                    _id: {
                        $ne: userId,
                    },
                    "fcmTokens.token":
                        token,
                },
                {
                    $pull: {
                        fcmTokens: {
                            token,
                        },
                    },
                },
            );
            // =====================================
            // REMOVE OLD COPY FROM CURRENT USER
            // =====================================
            await User.updateOne(
                {
                    _id: userId,
                },
                {
                    $pull: {
                        fcmTokens: {
                            token,
                        },
                    },
                },
            );
            // =====================================
            // SAVE CURRENT TOKEN
            // =====================================
            await User.updateOne(
                {
                    _id: userId,
                },
                {
                    $push: {
                        fcmTokens: {
                            token,
                            platform,
                            updatedAt:
                                new Date(),
                        },
                    },
                },
            );
            return res.json({
                success: true,
                message:
                    "Device token registered successfully",
            });
        } catch (error: any) {
            console.error(
                "REGISTER DEVICE TOKEN ERROR:",
                error,
            );
            return res.status(500).json({
                success: false,
                message:
                    error?.message ||
                    "Unable to register device token",
            });
        }
    }
    // =========================================
    // REMOVE FCM DEVICE TOKEN
    // =========================================
    static async remove(
        req: AuthRequest,
        res: Response,
    ) {
        try {
            const userId =
                req.user?.userId;
            const token =
                String(
                    req.body?.token || "",
                ).trim();
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }
            if (!token) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Device token is required",
                });
            }
            await User.updateOne(
                {
                    _id: userId,
                },
                {
                    $pull: {
                        fcmTokens: {
                            token,
                        },
                    },
                },
            );
            return res.json({
                success: true,
                message:
                    "Device token removed successfully",
            });
        } catch (error: any) {
            console.error(
                "REMOVE DEVICE TOKEN ERROR:",
                error,
            );
            return res.status(500).json({
                success: false,
                message:
                    error?.message ||
                    "Unable to remove device token",
            });
        }
    }
}