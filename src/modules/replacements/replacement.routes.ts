import {
    Router,
} from "express";

import {
    ReplacementController,
} from "./replacement.controller.js";

import {
    authenticate,
} from "../auth/middleware/auth.middleware.js";


// =========================================
// ROUTER
// =========================================

const router =
    Router();


// =========================================
// SELLER LOOKUP / LIST
// =========================================

router.get(
    "/seller",
    authenticate,
    ReplacementController.getSellerRequests,
);

router.get(
    "/seller/barcode/:barcode",
    authenticate,
    ReplacementController.getSellerRequestByBarcode,
);


// =========================================
// CUSTOMER
// =========================================

router.post(
    "/",
    authenticate,
    ReplacementController.createRequest,
);

router.get(
    "/",
    authenticate,
    ReplacementController.getMyRequests,
);

router.get(
    "/:id",
    authenticate,
    ReplacementController.getMyRequest,
);


// =========================================
// SELLER ACTIONS
// =========================================

router.patch(
    "/:id/approve",
    authenticate,
    ReplacementController.approve,
);

router.patch(
    "/:id/reject",
    authenticate,
    ReplacementController.reject,
);

router.post(
    "/:id/complete",
    authenticate,
    ReplacementController.complete,
);


export default router;