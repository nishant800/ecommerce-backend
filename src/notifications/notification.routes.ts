import {
    Router,
} from "express";

import {
    NotificationController,
} from "./notification.controller.js";

import {
    authenticate,
} from "../middleware/auth.middleware.js";


const router =
    Router();


// =========================================
// GET MY NOTIFICATIONS
// =========================================

router.get(
    "/",
    authenticate,
    NotificationController.getMyNotifications,
);


// =========================================
// GET UNREAD COUNT
// =========================================

router.get(
    "/unread-count",
    authenticate,
    NotificationController.getUnreadCount,
);


// =========================================
// MARK ONE AS READ
// =========================================

router.patch(
    "/:id/read",
    authenticate,
    NotificationController.markAsRead,
);


// =========================================
// MARK ALL AS READ
// =========================================

router.patch(
    "/read-all",
    authenticate,
    NotificationController.markAllAsRead,
);


export default router;