import { Router } from "express";
import {
    createOrder,
    OrderController,
} from "../modules/orders/order.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
const router = Router();
// =========================================
// CREATE ORDER
// =========================================
router.post(
    "/",
    authenticate,
    createOrder
);
// =========================================
// GET MY ORDERS
// =========================================
router.get(
    "/",
    authenticate,
    OrderController.getMyOrders
);
// =========================================
// GET ORDER DETAILS
// =========================================
router.get(
    "/:id",
    authenticate,
    OrderController.getOrder
);
// =========================================
// CANCEL SINGLE PRODUCT / ITEM
// PATCH /orders/:id/items/:itemIndex/cancel
// =========================================
router.patch(
    "/:id/items/:itemIndex/cancel",
    authenticate,
    OrderController.cancelItem
);
// =========================================
// CANCEL ENTIRE ORDER
// PATCH /orders/:id/cancel
// =========================================
router.patch(
    "/:id/cancel",
    authenticate,
    OrderController.cancel
);
export default router;