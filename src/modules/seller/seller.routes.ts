import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";

import { sellerOnly } from "../../middleware/seller.middleware.js";

import { SellerController } from "./seller.controller.js";

const router = Router();

router.use(authenticate);

router.use(sellerOnly);

router.get(
    "/dashboard",
    SellerController.dashboard
);
router.get(
    "/orders",
    SellerController.orders
);

router.get(
    "/orders/:id",
    SellerController.order
);

router.patch(
    "/orders/:id/status",
    SellerController.updateOrderStatus
);
router.post(
    "/orders/:id/shipping-label-generated",
    SellerController.markOrderShippedAfterLabel
);
router.patch(
    "/orders/:id/label-generated",
    SellerController.markOrderShippedAfterLabel
);
router.get(
    "/profile",
    SellerController.profile
);

router.patch(
    "/profile",
    SellerController.updateProfile
);

router.delete(
    "/profile",
    SellerController.deleteAccount
);
export default router;