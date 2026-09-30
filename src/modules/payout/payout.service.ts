import mongoose from "mongoose";
import crypto from "node:crypto";
import Account from "../seller/sellerPayoutAccount.model.js";
import Earning from "../seller/sellerEarning.model.js";
import Payout from "./payout.model.js";
import { EarningService } from "./earning.service.js";
import { financeConfig, isSingleSellerMode } from "./payout.money.js";
import { payoutProvider } from "./payout-account.service.js";
import type { ProviderPayout } from "./payout.provider.js";
import { NotificationService } from "../../notifications/notification.service.js";
import { NotificationRecipientRole, NotificationType } from "../../notifications/notification.model.js";

export function canExecutePayouts() {
    return !isSingleSellerMode() && process.env.ENABLE_AUTOMATIC_SELLER_PAYOUTS === "true" && payoutProvider.configured();
}
export class PayoutService {
    static async reserve(seller: string) {
        if (!canExecutePayouts()) throw new Error("Payout execution is disabled");
        const session = await mongoose.startSession();
        let payoutId: string | undefined;
        try {
            await session.withTransaction(async () => {
                payoutId = undefined;
                await EarningService.lock(seller, session);
                if (await Payout.exists({ seller, status: { $in: ["QUEUED", "PROCESSING"] } }).session(session)) return;
                const account = await Account.findOne({ seller, verificationStatus: "VERIFIED", isActive: true, payoutHeld: false }).session(session);
                if (!account?.providerFundAccountId) return;
                const orderIds = await Earning.distinct("order", { seller, status: { $in: ["AVAILABLE", "PENDING"] } }).session(session);
                for (const id of orderIds) await EarningService.reconcileForSeller(String(id), seller, session);
                const earnings = await Earning.find({ seller, status: "AVAILABLE", settlementMode: "ONLINE", payoutId: null }).session(session);
                const amount = earnings.reduce((sum, earning) => sum + earning.netAmount, 0);
                if (!Number.isSafeInteger(amount) || amount < financeConfig().minimum) return;
                const [payout] = await Payout.create([{
                    seller, payoutAccount: account._id, amount, earningIds: earnings.map(e => e._id),
                    providerReferenceId: crypto.randomUUID(), providerMode: payoutProvider.mode(), sourceAccount: process.env.RAZORPAYX_ACCOUNT_NUMBER,
                    accountSnapshot: { revision: account.revision, accountHolderName: account.accountHolderName, bankName: account.bankName,
                        accountNumberLast4: account.accountNumberLast4, ifsc: account.ifsc, providerFundAccountId: account.providerFundAccountId },
                    audit: [{ status: "QUEUED", at: new Date(), source: "reservation" }],
                }], { session });
                await Earning.updateMany({ _id: { $in: earnings.map(e => e._id) }, status: "AVAILABLE", payoutId: null },
                    { $set: { status: "PAYOUT_PENDING", payoutId: payout._id }, $inc: { __v: 1 } }, { session });
                payoutId = String(payout._id);
            });
        } finally { await session.endSession(); }
        return payoutId;
    }
    static async submit(id: string) {
        if (!canExecutePayouts()) throw new Error("Payout execution is disabled");
        const payout = await Payout.findById(id).select("+sourceAccount");
        if (!payout || !["QUEUED", "PROCESSING"].includes(payout.status)) return;
        if (payout.providerMode !== payoutProvider.mode()) throw new Error("Payout mode changed; reconciliation required");
        if (payout.providerPayoutId) {
            await this.applyProviderStatus(payout.providerReferenceId, await payoutProvider.fetchPayout(payout.providerPayoutId), "fetch");
            return;
        }
        // Never release on an HTTP timeout: the provider may already have transferred funds.
        // Re-use the exact stored body/key. Old ambiguous submissions require operator reconciliation.
        if (payout.submittedAt && Date.now() - payout.submittedAt.getTime() > 86_400_000) throw new Error("Ambiguous payout requires provider reconciliation");
        if (!payout.submittedAt) {
            let permitted = false;
            const session = await mongoose.startSession();
            try { await session.withTransaction(async () => {
                permitted = false;
                await EarningService.lock(String(payout.seller), session);
                const current = await Payout.findById(id).session(session);
                if (!current || !["QUEUED", "PROCESSING"].includes(current.status)) return;
                if (current.submittedAt) { permitted = true; return; }
                const account = await Account.findById(payout.payoutAccount).session(session);
                if (!account?.isActive || account.payoutHeld || account.revision !== payout.accountSnapshot?.revision || account.verificationStatus !== "VERIFIED") return;
                const orders = await Earning.distinct("order", { payoutId: payout._id }).session(session);
                for (const order of orders) await EarningService.reconcileForSeller(String(order), String(payout.seller), session);
                // A refund after reservation but before submission must cancel this unsent batch.
                if (await Earning.exists({ seller: payout.seller, status: "AVAILABLE", netAmount: { $lt: 0 }, payoutId: null }).session(session)) return;
                current.submittedAt = new Date();
                await current.save({ session });
                permitted = true;
            }); } finally { await session.endSession(); }
            if (!permitted) { await this.cancelUnsubmitted(id); return; }
        }
        const response = await payoutProvider.createPayout({ amount: payout.amount, reference: payout.providerReferenceId,
            fundAccountId: payout.accountSnapshot!.providerFundAccountId!, sourceAccount: payout.sourceAccount });
        await this.applyProviderStatus(payout.providerReferenceId, response, "create");
    }
    static async cancelUnsubmitted(id: string) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const payout = await Payout.findById(id).session(session);
                if (!payout || payout.submittedAt || payout.status !== "QUEUED") return;
                await EarningService.lock(String(payout.seller), session);
                payout.status = "FAILED";
                payout.failureReason = "Bank account changed or payout held before submission";
                payout.audit.push({ status: "FAILED", at: new Date(), source: "cancel-unsubmitted" });
                await payout.save({ session });
                await Earning.updateMany({ payoutId: payout._id, status: "PAYOUT_PENDING" },
                    { $set: { payoutId: null, status: "AVAILABLE" }, $inc: { __v: 1 } }, { session });
            });
        } finally { await session.endSession(); }
    }
    static async applyProviderStatus(reference: string, provider: ProviderPayout, source: string, eventId?: string) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const payout = await Payout.findOne({ providerReferenceId: reference }).session(session);
                if (!payout) throw new Error("Payout not found");
                await EarningService.lock(String(payout.seller), session);
                if (provider.amount !== payout.amount || provider.currency !== "INR" || provider.fund_account_id !== payout.accountSnapshot?.providerFundAccountId
                    || provider.reference_id !== reference || (payout.providerPayoutId && payout.providerPayoutId !== provider.id)) throw new Error("Provider payout mismatch");
                if (eventId && payout.webhookEventIds.includes(eventId)) return;
                const next = provider.status === "processed" ? "PROCESSED" : provider.status === "reversed" ? "REVERSED"
                    : ["failed", "rejected", "cancelled"].includes(provider.status) ? "FAILED" : "PROCESSING";
                // A processed payment may reverse, but a delayed queued webhook never downgrades it.
                if (["FAILED", "REVERSED"].includes(payout.status) || (payout.status === "PROCESSED" && next !== "REVERSED")) return;
                const changed = payout.status !== next;
                payout.providerPayoutId = provider.id;
                payout.status = next;
                if (eventId) payout.webhookEventIds.push(eventId);
                if (changed) payout.audit.push({ status: next, at: new Date(), source });
                if (next === "PROCESSED") {
                    payout.processedAt = new Date();
                    await Earning.updateMany({ payoutId: payout._id, status: "PAYOUT_PENDING" }, { $set: { status: "PAID" }, $inc: { __v: 1 } }, { session });
                }
                if (next === "FAILED" || next === "REVERSED") {
                    payout.failedAt = new Date();
                    payout.failureReason = "Provider confirmed payout failure or reversal. Funds are available for a future settlement.";
                    await Earning.updateMany({ payoutId: payout._id, status: { $in: ["PAYOUT_PENDING", "PAID"] } },
                        { $set: { status: "AVAILABLE", payoutId: null }, $inc: { __v: 1 } }, { session });
                }
                await payout.save({ session });
                if (changed) await NotificationService.enqueue({ userId: payout.seller, recipientRole: NotificationRecipientRole.SELLER,
                    type: NotificationType.GENERAL, title: `Payout ${next.toLowerCase()}`, message: `Your payout of INR ${(payout.amount / 100).toFixed(2)} is ${next.toLowerCase()}.`,
                    dedupeKey: `payout:${payout._id}:${next}`, data: { payoutId: String(payout._id) } }, session);
            });
        } finally { await session.endSession(); }
    }
    static async processEligibleSellerPayouts() {
        if (!canExecutePayouts()) return { enabled: false, processed: 0 };
        let processed = 0;
        const existing = await Payout.find({ status: { $in: ["QUEUED", "PROCESSING"] } }).select("_id").limit(100);
        for (const payout of existing) {
            try { await this.submit(String(payout._id)); } catch { console.error("Payout reconciliation deferred", String(payout._id)); }
        }
        const accounts = await Account.find({ verificationStatus: "VERIFIED", isActive: true, payoutHeld: false }).select("seller");
        for (const account of accounts) {
            try {
                const id = await this.reserve(String(account.seller));
                if (id) { await this.submit(id); processed++; }
            } catch { console.error("Seller payout deferred", String(account.seller)); }
        }
        return { enabled: true, processed };
    }
}
