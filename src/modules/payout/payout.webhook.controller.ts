import crypto from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { verifyWebhookSignature } from "./payout.security.js";
import { payoutProvider, PayoutAccountService } from "./payout-account.service.js";
import Account from "../seller/sellerPayoutAccount.model.js";
import { PayoutService } from "./payout.service.js";

const envelope = z.object({ event: z.string(), payload: z.record(z.string(), z.object({ entity: z.object({ id: z.string() }).passthrough() })) });
export async function payoutWebhook(req: Request, res: Response) {
    const secret = process.env.RAZORPAYX_WEBHOOK_SECRET;
    if (!secret) { res.status(503).json({ success: false }); return; }
    if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, String(req.headers["x-razorpay-signature"] || ""), secret)) {
        res.status(400).json({ success: false, message: "Invalid webhook signature" }); return;
    }
    try {
        const body = envelope.parse(JSON.parse(req.body.toString("utf8")));
        const eventId = String(req.headers["x-razorpay-event-id"] || crypto.createHash("sha256").update(req.body).digest("hex"));
        if (body.event.startsWith("payout.") && body.payload.payout) {
            // Fetch authoritative status to handle delayed/out-of-order webhook delivery.
            const payout = await payoutProvider.fetchPayout(body.payload.payout.entity.id);
            if (!payout.reference_id) throw new Error("Missing payout reference");
            await PayoutService.applyProviderStatus(payout.reference_id, payout, "webhook", eventId);
        } else if (body.event.startsWith("fund_account.validation.")) {
            const entity = body.payload.fund_account_validation || body.payload["fund_account.validation"];
            if (entity) {
                const validation = await payoutProvider.fetchBankValidation(entity.entity.id);
                // Recover a validation response lost after the provider accepted the request.
                await Account.updateOne({ providerFundAccountId: validation.fund_account.id, verificationStatus: "PENDING", verificationReferenceId: null },
                    { $set: { verificationReferenceId: validation.id } });
                await PayoutAccountService.applyValidation(validation);
            }
        }
        res.json({ success: true });
    } catch { res.status(503).json({ success: false, message: "Webhook reconciliation deferred" }); }
}
