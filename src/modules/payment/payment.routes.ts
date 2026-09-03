import { Router } from "express";
import { PaymentController } from "./payment.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Create Razorpay Order
router.post("/create", PaymentController.createPayment);
router.post("/verify", PaymentController.verifyPayment);

export default router;