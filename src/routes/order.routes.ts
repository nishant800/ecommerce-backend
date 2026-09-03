import { Router } from "express";
import {
    createOrder,
    OrderController,
} from "../modules/orders/order.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// Create Order
router.post(
    "/",
    authenticate,
    createOrder
);

// Get My Orders
router.get(
    "/",
    authenticate,
    OrderController.getMyOrders
);

// Get Order Details
router.get(
    "/:id",
    authenticate,
    OrderController.getOrder
);

// Cancel Order
router.patch(
    "/:id/cancel",
    authenticate,
    OrderController.cancel
);

export default router;