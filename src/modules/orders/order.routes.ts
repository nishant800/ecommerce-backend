import { Router } from "express";

import {
    createOrder,
    OrderController,
} from "./order.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Create Order
router.post("/", createOrder);

// Get My Orders
router.get(
    "/",
    OrderController.getMyOrders
);

// Get Order Details
router.get(
    "/:id",
    OrderController.getOrder
);

// Cancel Order
router.patch(
    "/:id/cancel",
    OrderController.cancel
);

export default router;