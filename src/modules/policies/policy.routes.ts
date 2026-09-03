import {
    Router,
} from "express";

import {
    PolicyController,
} from "./policy.controller.js";


const router =
    Router();


// =========================================
// PUBLIC POLICY ROUTES
// =========================================

// Get all active policies

router.get(
    "/",
    PolicyController.getAllPolicies,
);


// Get one policy

router.get(
    "/:type",
    PolicyController.getPolicy,
);


export default router;