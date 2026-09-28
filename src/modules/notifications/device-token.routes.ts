import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
    DeviceTokenController,
} from "./device-token.controller.js";
const router = Router();
// =========================================
// REGISTER / UPDATE DEVICE TOKEN
// =========================================
router.put(
    "/",
    authenticate,
    DeviceTokenController.register,
);
// =========================================
// REMOVE DEVICE TOKEN
// =========================================
router.delete(
    "/",
    authenticate,
    DeviceTokenController.remove,
);
export default router;