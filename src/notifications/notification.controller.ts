import {
    Response,
} from "express";

import {
    AuthRequest,
} from "../middleware/auth.middleware.js";

import {
    NotificationService,
} from "./notification.service.js";

import {
    NotificationRecipientRole,
} from "./notification.model.js";

// =========================================
// GET APP RECIPIENT ROLE
// =========================================

const getRecipientRole = (
    req: AuthRequest,
): NotificationRecipientRole => {

    const appRole =
        String(
            req.headers["x-app-role"] || "",
        )
            .trim()
            .toLowerCase();


    if (
        appRole === "seller"
    ) {

        return NotificationRecipientRole.SELLER;
    }


    if (
        appRole === "customer"
    ) {

        return NotificationRecipientRole.CUSTOMER;
    }


    // Fallback for older clients
    const userRole =
        req.user?.role;


    if (
        userRole === "seller"
    ) {

        return NotificationRecipientRole.SELLER;
    }


    if (
        userRole === "customer"
    ) {

        return NotificationRecipientRole.CUSTOMER;
    }


    throw new Error(
        "Invalid notification recipient role.",
    );
};
// =========================================
// NOTIFICATION CONTROLLER
// =========================================

export class NotificationController {


    // =========================================
    // GET MY NOTIFICATIONS
    // =========================================

    static async getMyNotifications(
        req: AuthRequest,
        res: Response,
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


            const recipientRole =
                getRecipientRole(
                    req,
                );


            const notifications =
                await NotificationService
                    .getUserNotifications(
                        userId,
                        recipientRole,
                    );


            return res.json({

                success:
                    true,

                data:
                    notifications,

            });

        } catch (error: any) {

            console.error(
                "GET NOTIFICATIONS ERROR:",
                error,
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    error?.message ||
                    "Unable to load notifications.",

            });
        }
    }


    // =========================================
    // GET UNREAD COUNT
    // =========================================

    static async getUnreadCount(
        req: AuthRequest,
        res: Response,
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


            const recipientRole =
                getRecipientRole(
                    req,
                );


            const count =
                await NotificationService
                    .getUnreadCount(
                        userId,
                        recipientRole,
                    );


            return res.json({

                success:
                    true,

                data: {
                    count,
                },

            });

        } catch (error: any) {

            console.error(
                "GET UNREAD COUNT ERROR:",
                error,
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    error?.message ||
                    "Unable to load unread notification count.",

            });
        }
    }


    // =========================================
    // MARK ONE AS READ
    // =========================================

    static async markAsRead(
        req: AuthRequest,
        res: Response,
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


            const recipientRole =
                getRecipientRole(
                    req,
                );


            const notification =
                await NotificationService
                    .markAsRead(
                        userId,
                        String(
                            req.params.id,
                        ),
                        recipientRole,
                    );


            if (!notification) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Notification not found.",

                });
            }


            return res.json({

                success:
                    true,

                data:
                    notification,

            });

        } catch (error: any) {

            console.error(
                "MARK NOTIFICATION READ ERROR:",
                error,
            );

            return res.status(400).json({

                success:
                    false,

                message:
                    error?.message ||
                    "Unable to mark notification as read.",

            });
        }
    }


    // =========================================
    // MARK ALL AS READ
    // =========================================

    static async markAllAsRead(
        req: AuthRequest,
        res: Response,
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


            const recipientRole =
                getRecipientRole(
                    req,
                );


            await NotificationService
                .markAllAsRead(
                    userId,
                    recipientRole,
                );


            return res.json({

                success:
                    true,

                message:
                    "All notifications marked as read.",

            });

        } catch (error: any) {

            console.error(
                "MARK ALL NOTIFICATIONS READ ERROR:",
                error,
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    error?.message ||
                    "Unable to mark all notifications as read.",

            });
        }
    }
}