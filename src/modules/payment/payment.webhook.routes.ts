import {
    Router,
} from "express";

import {
    PaymentWebhookController,
} from "./payment.webhook.controller.js";

const router =
    Router();

router.post(
    "/",
    PaymentWebhookController.handle,
);

export default router;